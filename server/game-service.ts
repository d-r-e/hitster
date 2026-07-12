import { randomBytes, randomUUID } from 'node:crypto';
import type { GameState, PublicPlayer, Song } from '../shared/game.js';
import type { SongPack } from './catalog.js';

type Player = PublicPlayer & { token: string; controllerId?: string; disconnectedAt?: number };
type Room = {
  code: string; players: Player[]; deck: Song[]; phase: GameState['phase'];
  activeIndex: number; round: number; currentSong?: Song; placement?: number;
  winnerId?: string; message?: string; titleClaimed?: boolean;
  selectedPackIds: string[];
  challenges: Array<{ playerId: string; position: number }>;
  lastResult?: { playerId: string; correct: boolean; cardOwnerId: string; titleTokenAwarded?: boolean; guaranteed?: boolean };
};

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;
const MAX_ROOMS = 500;
const WINNING_SCORE = 10;
const MAX_TOKENS = 5;
const MIN_SONGS_PER_PLAYER = 20;

const shuffle = <T>(items: T[]) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

export class GameService {
  private rooms = new Map<string, Room>();
  constructor(private readonly packs: SongPack[]) {}

  private roomCode() {
    let code: string;
    do code = Array.from(randomBytes(6), b => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
    while (this.rooms.has(code));
    return code!;
  }

  /** Songs available across the packs the host selected, deduplicated by track id. */
  private songsFor(room: Room): Song[] {
    const selected = new Set(room.selectedPackIds);
    const seen = new Set<string>();
    const songs: Song[] = [];
    for (const pack of this.packs) {
      if (!selected.has(pack.id)) continue;
      for (const song of pack.songs) {
        if (seen.has(song.id)) continue;
        seen.add(song.id);
        songs.push(song);
      }
    }
    return songs;
  }

  private selectedCount(room: Room): number {
    return this.songsFor(room).length;
  }

  createRoom(nickname: string) {
    if (this.rooms.size >= MAX_ROOMS) throw new Error('The server is busy. Please try again shortly.');
    const code = this.roomCode();
    const player = this.newPlayer(nickname, true);
    const room: Room = { code, players: [player], deck: [], phase: 'lobby', activeIndex: 0, round: 0, challenges: [], selectedPackIds: this.packs.map(pack => pack.id) };
    this.rooms.set(code, room);
    return { player, room };
  }

  setPacks(code: string, playerId: string, ids: string[]) {
    const room = this.requireHost(code, playerId);
    if (room.phase !== 'lobby') throw new Error('Song packs can only be changed before the game starts.');
    const valid = new Set(this.packs.map(pack => pack.id));
    const next = [...new Set(ids.filter(id => valid.has(id)))];
    room.selectedPackIds = next.length ? next : [...valid];
    return room;
  }

  joinRoom(code: string, nickname: string) {
    const room = this.requireRoom(code);
    if (room.phase !== 'lobby') throw new Error('The game has already started.');
    if (room.players.length >= MAX_PLAYERS) throw new Error('This room is full.');
    if (room.players.some(player => player.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase())) throw new Error('That nickname is already in use.');
    const player = this.newPlayer(nickname, false);
    room.players.push(player);
    return { player, room };
  }

  addLocalPlayer(code: string, controllerId: string, controllerToken: string, nickname: string) {
    const room = this.requireRoom(code);
    const controller = room.players.find(player => player.id === controllerId && player.token === controllerToken);
    if (!controller) throw new Error('This player session is no longer valid.');
    if (room.phase !== 'lobby') throw new Error('Local players can only be added in the lobby.');
    if (room.players.length >= MAX_PLAYERS) throw new Error('This room is full.');
    if (room.players.some(player => player.nickname.toLocaleLowerCase() === nickname.trim().toLocaleLowerCase())) throw new Error('That nickname is already in use.');
    const player = this.newPlayer(nickname, false, controller.id);
    room.players.push(player);
    return { player, room };
  }

  controlledPlayerId(code: string, controllerId: string, requestedPlayerId: string) {
    const room = this.requireRoom(code);
    const player = room.players.find(item => item.id === requestedPlayerId);
    if (!player || (player.id !== controllerId && player.controllerId !== controllerId)) throw new Error('You cannot control that player.');
    return player.id;
  }

  reconnect(code: string, playerId: string, token: string) {
    const room = this.requireRoom(code);
    const player = room.players.find(item => item.id === playerId && item.token === token);
    if (!player) throw new Error('This player session is no longer valid.');
    if (player.disconnectedAt && Date.now() - player.disconnectedAt > 5 * 60_000) throw new Error('The rejoin window has expired.');
    player.connected = true; delete player.disconnectedAt;
    return { room, player };
  }

  disconnect(code: string, playerId: string) {
    const room = this.rooms.get(code);
    const player = room?.players.find(item => item.id === playerId);
    if (!room || !player) return;
    const disconnectedAt = Date.now();
    player.connected = false; player.disconnectedAt = disconnectedAt;
    return { room, disconnectedAt };
  }

  expireDisconnect(code: string, playerId: string, disconnectedAt: number) {
    const room = this.rooms.get(code);
    const player = room?.players.find(item => item.id === playerId);
    if (!room || !player || player.connected || player.disconnectedAt !== disconnectedAt) return;
    if (player.isHost && room.phase === 'lobby') {
      this.rooms.delete(code);
      return;
    }
    if (player.isHost && room.phase !== 'finished' && room.phase !== 'interrupted') {
      room.phase = 'interrupted'; room.message = 'The DJ did not reconnect within five minutes.';
      return room;
    }
    const playerIndex = room.players.indexOf(player);
    room.players.splice(playerIndex, 1);
    if (room.players.length === 0) { this.rooms.delete(code); return; }
    if (room.phase === 'placing' || room.phase === 'adjudicating') {
      room.currentSong = undefined; room.placement = undefined; room.titleClaimed = false; room.challenges = []; room.lastResult = undefined;
      room.activeIndex = playerIndex % room.players.length;
      room.phase = 'ready'; room.message = `${player.nickname} did not reconnect. Their round was skipped.`;
    } else if (room.phase === 'revealed' && playerIndex === room.activeIndex) {
      room.activeIndex = (playerIndex - 1 + room.players.length) % room.players.length;
    } else if (playerIndex < room.activeIndex) {
      room.activeIndex -= 1;
    } else if (room.activeIndex >= room.players.length) {
      room.activeIndex = 0;
    }
    return room;
  }

  start(code: string, playerId: string) {
    const room = this.requireHost(code, playerId);
    if (room.players.length < 1) throw new Error('At least one player is needed.');
    const songs = this.songsFor(room);
    if (songs.length < room.players.length * MIN_SONGS_PER_PLAYER) throw new Error(`Select at least ${MIN_SONGS_PER_PLAYER} songs per player.`);
    room.deck = shuffle(songs);
    room.players.forEach(player => {
      const song = this.draw(room);
      player.timeline = [{ id: randomUUID(), song }]; player.score = 0; player.tokens = 2;
    });
    room.activeIndex = 0; room.phase = 'ready'; room.message = `${room.players[0].nickname} starts.`;
    return room;
  }

  beginRound(code: string, playerId: string) {
    const room = this.requireHost(code, playerId);
    if (room.phase !== 'ready' && room.phase !== 'revealed') throw new Error('Reveal the current round before starting another.');
    if (room.phase === 'revealed') room.activeIndex = (room.activeIndex + 1) % room.players.length;
    if (room.deck.length === 0) {
      const winner = [...room.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))[0];
      room.phase = 'finished'; room.winnerId = winner.id; room.message = 'The music deck is empty.';
      return room;
    }
    room.currentSong = this.draw(room); room.placement = undefined; room.lastResult = undefined; room.titleClaimed = false; room.challenges = []; room.round += 1; room.phase = 'placing'; room.message = `${this.active(room).nickname}, place the song on your timeline.`;
    return room;
  }

  replaceRoundSong(code: string, playerId: string) {
    const room = this.requireHost(code, playerId);
    if (room.phase !== 'placing') throw new Error('An active round is required to replace its song.');
    if (room.placement !== undefined || room.challenges.length || room.titleClaimed) throw new Error('Replace an unavailable song before any guesses.');
    room.currentSong = this.draw(room);
    room.message = 'The DJ replaced the song. Listen, then open placement.';
    return room;
  }

  currentDjSongUri(code: string, playerId: string) {
    const room = this.requireHost(code, playerId);
    if (!room.currentSong || room.phase !== 'placing') throw new Error('There is no active DJ song.');
    return room.currentSong.spotifyUri;
  }

  selectPosition(code: string, playerId: string, position: number) {
    const room = this.requireRoom(code);
    if (room.phase !== 'placing') throw new Error('Placement is not open.');
    const active = this.active(room);
    if (active.id !== playerId) throw new Error('It is not your turn.');
    if (!Number.isInteger(position) || position < 0 || position > active.timeline.length) throw new Error('That timeline position is invalid.');
    room.placement = position; room.message = `${active.nickname} selected a position.`;
    return room;
  }

  setTitleClaim(code: string, playerId: string, claimed: boolean) {
    const room = this.requireRoom(code); const active = this.active(room);
    if (room.phase !== 'placing' || active.id !== playerId) throw new Error('Only the active player can claim the title and artist.');
    room.titleClaimed = Boolean(claimed); return room;
  }

  challengePosition(code: string, playerId: string, position: number) {
    const room = this.requireRoom(code); const active = this.active(room);
    if (room.phase !== 'placing' || active.id === playerId) throw new Error('You cannot challenge this turn.');
    const challenger = room.players.find(player => player.id === playerId);
    if (!challenger || challenger.tokens < 1) throw new Error('You need one HITSTER token.');
    if (room.placement === undefined) throw new Error('Wait for the active player to choose a position.');
    if (room.placement === position) throw new Error('Choose a different position from the active player.');
    if (room.challenges.some(challenge => challenge.playerId === playerId)) throw new Error('You already challenged this song.');
    if (room.challenges.some(challenge => challenge.position === position)) throw new Error('That challenge position is already occupied.');
    if (!Number.isInteger(position) || position < 0 || position > active.timeline.length) throw new Error('That timeline position is invalid.');
    challenger.tokens -= 1; room.challenges.push({ playerId, position }); return room;
  }

  skipSong(code: string, playerId: string) {
    const room = this.requireRoom(code); const active = this.active(room);
    if (room.phase !== 'placing' || active.id !== playerId) throw new Error('Only the active player can skip.');
    if (active.tokens < 1) throw new Error('You need one HITSTER token.');
    if (room.placement !== undefined || room.challenges.length || room.titleClaimed) throw new Error('Skip before making any guesses.');
    active.tokens -= 1; room.currentSong = this.draw(room); room.message = `${active.nickname} skipped the song.`; return room;
  }

  confirmPosition(code: string, playerId: string) {
    const room = this.requireRoom(code);
    if (room.phase !== 'placing') throw new Error('Placement is not open.');
    const active = this.active(room);
    if (active.id !== playerId) throw new Error('It is not your turn.');
    if (room.placement === undefined) throw new Error('Choose a position before confirming.');
    if (!room.currentSong) throw new Error('There is no active song.');
    const song = room.currentSong; const position = room.placement;
    const before = active.timeline[position - 1]?.song.year;
    const after = active.timeline[position]?.song.year;
    const correct = (before === undefined || before <= song.year) && (after === undefined || song.year <= after);
    const winningChallenge = !correct ? room.challenges.find(challenge => {
      const challengeBefore = active.timeline[challenge.position - 1]?.song.year;
      const challengeAfter = active.timeline[challenge.position]?.song.year;
      return (challengeBefore === undefined || challengeBefore <= song.year) && (challengeAfter === undefined || song.year <= challengeAfter);
    }) : undefined;
    const cardOwner = winningChallenge ? room.players.find(player => player.id === winningChallenge.playerId)! : active;
    const ownerPosition = winningChallenge ? this.sortedPosition(cardOwner.timeline, song.year) : correct ? position : this.sortedPosition(active.timeline, song.year);
    cardOwner.timeline.splice(ownerPosition, 0, { id: randomUUID(), song });
    if (correct || winningChallenge) cardOwner.score += 1;
    room.lastResult = { playerId: active.id, correct, cardOwnerId: cardOwner.id };
    room.message = correct ? `${active.nickname} placed it correctly!` : winningChallenge ? `${cardOwner.nickname} stole the song!` : `${active.nickname}'s placement was corrected on the board.`;
    room.placement = undefined;
    if (cardOwner.score >= WINNING_SCORE) { room.phase = 'finished'; room.winnerId = cardOwner.id; return room; }
    room.phase = room.titleClaimed ? 'adjudicating' : 'revealed';
    return room;
  }

  adjudicateTitle(code: string, playerId: string, correct: boolean) {
    const room = this.requireHost(code, playerId);
    if (room.phase !== 'adjudicating' || !room.lastResult) throw new Error('There is no title guess to validate.');
    const active = room.players.find(player => player.id === room.lastResult!.playerId)!;
    if (correct && active.tokens < MAX_TOKENS) { active.tokens += 1; room.lastResult.titleTokenAwarded = true; }
    room.phase = 'revealed'; return room;
  }

  buyGuaranteedCard(code: string, playerId: string) {
    const room = this.requireRoom(code);
    if (room.phase !== 'ready' && room.phase !== 'revealed') throw new Error('You can only buy a card between songs.');
    const targetIndex = room.phase === 'ready' ? room.activeIndex : (room.activeIndex + 1) % room.players.length;
    const player = room.players[targetIndex];
    if (player.id !== playerId) throw new Error('It is not your upcoming turn.');
    if (player.tokens < 3) throw new Error('You need three HITSTER tokens.');
    const song = this.draw(room); player.tokens -= 3; player.score += 1;
    player.timeline.splice(this.sortedPosition(player.timeline, song.year), 0, { id: randomUUID(), song });
    room.activeIndex = targetIndex; room.currentSong = song; room.round += 1; room.lastResult = { playerId, correct: true, cardOwnerId: playerId, guaranteed: true };
    room.message = `${player.nickname} bought a guaranteed card.`;
    if (player.score >= WINNING_SCORE) { room.phase = 'finished'; room.winnerId = playerId; } else room.phase = 'revealed';
    return room;
  }

  state(room: Room): GameState {
    const canSeeAnswer = room.phase === 'adjudicating' || room.phase === 'revealed' || room.phase === 'finished';
    return {
      roomCode: room.code, phase: room.phase, players: room.players.map(player => ({ id: player.id, nickname: player.nickname, isHost: player.isHost, connected: player.connected, score: player.score, tokens: player.tokens, timeline: player.timeline })),
      availablePacks: this.packs.map(pack => ({ id: pack.id, name: pack.name, count: pack.songs.length })),
      selectedPackIds: room.selectedPackIds,
      selectedSongCount: this.selectedCount(room),
      activePlayerId: room.phase === 'lobby' || room.phase === 'interrupted' ? null : this.active(room).id,
      hostPlayerId: room.players.find(player => player.isHost)!.id, round: room.round, winningScore: WINNING_SCORE,
      ...(canSeeAnswer && room.currentSong ? { currentSong: room.currentSong } : {}),
      ...(room.placement !== undefined ? { selectedPosition: room.placement } : {}),
      ...(room.titleClaimed ? { titleClaimed: true } : {}),
      ...(room.challenges.length ? { challenges: room.challenges } : {}),
      ...(room.lastResult ? { lastResult: room.lastResult } : {}),
      ...(room.winnerId ? { winnerId: room.winnerId } : {}), ...(room.message ? { message: room.message } : {})
    };
  }

  private newPlayer(nickname: string, isHost: boolean, controllerId?: string): Player {
    const clean = nickname.trim().slice(0, 24);
    if (clean.length < 2) throw new Error('Choose a nickname with at least two characters.');
    return { id: randomUUID(), token: randomBytes(24).toString('base64url'), ...(controllerId ? { controllerId } : {}), nickname: clean, isHost, connected: true, score: 0, tokens: 2, timeline: [] };
  }
  private requireRoom(code: string) { const room = this.rooms.get(code.toUpperCase()); if (!room) throw new Error('Room not found.'); return room; }
  private requireHost(code: string, playerId: string) { const room = this.requireRoom(code); if (room.players.find(player => player.id === playerId)?.isHost !== true) throw new Error('Only the host can do that.'); return room; }
  private active(room: Room) { return room.players[room.activeIndex]; }
  private sortedPosition(timeline: PublicPlayer['timeline'], year: number) { const position = timeline.findIndex(card => card.song.year > year); return position < 0 ? timeline.length : position; }
  private draw(room: Room) { const song = room.deck.pop(); if (!song) throw new Error('The music deck is empty.'); return song; }
}
