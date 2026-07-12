import assert from 'node:assert/strict';
import test from 'node:test';
import type { Song } from '../shared/game.js';
import { GameService } from './game-service.js';

const baseYears = [1960, 1970, 1980, 1990, 2000, 2010, 2020];

function packs(years = [...baseYears, ...baseYears, ...baseYears, ...baseYears, ...baseYears, ...baseYears, ...baseYears, ...baseYears, ...baseYears]) {
  return [{ id: 'all', name: 'All', songs: years.map((year, index): Song => ({ id: `song-${index}`, artist: `Artist ${index}`, title: `Song ${index}`, year, spotifyUri: `spotify:track:${index}` })) }];
}

test('a solo DJ can complete a hidden listen/place/confirm loop', () => {
  const game = new GameService(packs());
  const { room, player } = game.createRoom('Solo DJ');
  game.start(room.code, player.id);
  game.beginRound(room.code, player.id);
  assert.match(game.currentDjSongUri(room.code, player.id), /^spotify:track:/);
  assert.equal(game.state(room).currentSong, undefined);
  const year = room.currentSong!.year;
  const position = room.players[0].timeline.findIndex(card => card.song.year > year);
  game.selectPosition(room.code, player.id, position < 0 ? room.players[0].timeline.length : position);
  assert.equal(game.state(room).currentSong, undefined);
  assert.equal(game.state(room).phase, 'placing');
  game.confirmPosition(room.code, player.id);
  assert.equal(game.state(room).phase, 'revealed');
  assert.equal(game.state(room).currentSong?.year, year);
  assert.equal(room.players[0].score, 1);
  assert.equal(room.players[0].timeline.length, 2);
});

test('same-year songs are valid on either side', () => {
  const game = new GameService(packs(Array.from({ length: 21 }, () => 2000)));
  const { room, player } = game.createRoom('DJ');
  game.start(room.code, player.id); game.beginRound(room.code, player.id);
  game.selectPosition(room.code, player.id, 0); game.confirmPosition(room.code, player.id);
  assert.equal(room.players[0].score, 1);
  assert.equal(room.players[0].timeline.length, 2);
});

test('the active player can change their selected position before confirming', () => {
  const game = new GameService(packs());
  const { room, player } = game.createRoom('DJ');
  game.start(room.code, player.id); game.beginRound(room.code, player.id);
  game.selectPosition(room.code, player.id, 0);
  assert.equal(game.state(room).selectedPosition, 0);
  game.selectPosition(room.code, player.id, 1);
  assert.equal(game.state(room).selectedPosition, 1);
  assert.equal(room.phase, 'placing');
  game.confirmPosition(room.code, player.id);
  assert.equal(room.phase, 'revealed');
});

test('a HITSTER challenge does not prevent the active player from moving their placement', () => {
  const game = new GameService(packs());
  const { room, player: host } = game.createRoom('Host');
  const { player: guest } = game.joinRoom(room.code, 'Guest');
  game.start(room.code, host.id); game.beginRound(room.code, host.id);
  const active = room.players[room.activeIndex];
  const challenger = active.id === host.id ? guest : host;
  game.selectPosition(room.code, active.id, 0);
  game.challengePosition(room.code, challenger.id, 1);
  game.selectPosition(room.code, active.id, 1);
  assert.equal(room.placement, 1);
});

test('a wrong guess earns no disc but is corrected onto the player board', () => {
  const game = new GameService(packs(Array.from({ length: 21 }, (_, index) => 1960 + index * 3)));
  const { room, player } = game.createRoom('DJ');
  game.start(room.code, player.id); game.beginRound(room.code, player.id);
  const songYear = room.currentSong!.year;
  const existingYear = room.players[0].timeline[0].song.year;
  const wrongPosition = songYear < existingYear ? 1 : 0;
  game.selectPosition(room.code, player.id, wrongPosition); game.confirmPosition(room.code, player.id);
  assert.equal(room.players[0].score, 0);
  const years = room.players[0].timeline.map(card => card.song.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.equal(game.state(room).lastResult?.correct, false);
});

test('only the active player can select and confirm', () => {
  const game = new GameService(packs());
  const { room, player: host } = game.createRoom('Host');
  const { player: guest } = game.joinRoom(room.code, 'Guest');
  game.start(room.code, host.id); game.beginRound(room.code, host.id);
  const active = game.state(room).activePlayerId!;
  const inactive = active === host.id ? guest.id : host.id;
  assert.throws(() => game.selectPosition(room.code, inactive, 0), /not your turn/);
  game.selectPosition(room.code, active, 0);
  assert.throws(() => game.confirmPosition(room.code, inactive), /not your turn/);
  game.confirmPosition(room.code, active);
});

test('a device can add and control local players while other sessions cannot', () => {
  const game = new GameService(packs());
  const { room, player: host } = game.createRoom('Host');
  const { player: local } = game.addLocalPlayer(room.code, host.id, host.token, 'Local player');
  const { player: remote } = game.joinRoom(room.code, 'Remote');
  game.start(room.code, host.id);
  room.activeIndex = room.players.findIndex(player => player.id === local.id);
  game.beginRound(room.code, host.id);
  const localActor = game.controlledPlayerId(room.code, host.id, local.id);
  game.selectPosition(room.code, localActor, 0);
  assert.equal(room.placement, 0);
  assert.throws(() => game.controlledPlayerId(room.code, remote.id, local.id), /cannot control/);
});

test('a reconnect cancels host disconnect expiry', () => {
  const game = new GameService(packs());
  const { room, player } = game.createRoom('Host');
  game.start(room.code, player.id);
  const disconnected = game.disconnect(room.code, player.id)!;
  game.reconnect(room.code, player.id, player.token);
  assert.equal(game.expireDisconnect(room.code, player.id, disconnected.disconnectedAt), undefined);
  assert.notEqual(room.phase, 'interrupted');
});

test('an expired guest is removed and their active round is safely skipped', () => {
  const game = new GameService(packs());
  const { room, player: host } = game.createRoom('Host');
  const { player: guest } = game.joinRoom(room.code, 'Guest');
  game.start(room.code, host.id); room.activeIndex = room.players.findIndex(player => player.id === guest.id);
  game.beginRound(room.code, host.id);
  const disconnected = game.disconnect(room.code, guest.id)!;
  const updated = game.expireDisconnect(room.code, guest.id, disconnected.disconnectedAt)!;
  assert.equal(updated.players.length, 1);
  assert.equal(updated.phase, 'ready');
  assert.equal(updated.players[updated.activeIndex].id, host.id);
});

test('an exhausted deck finishes the game instead of failing mid-round', () => {
  const game = new GameService(packs(Array.from({ length: 60 }, (_, index) => 1960 + index * 2)));
  const { room, player } = game.createRoom('DJ');
  game.start(room.code, player.id);
  let guard = 0;
  while (room.phase !== 'finished' && guard < 200) {
    const updated = game.beginRound(room.code, player.id);
    if (updated.phase === 'finished') break;
    game.selectPosition(room.code, player.id, 0); game.confirmPosition(room.code, player.id);
    guard += 1;
  }
  assert.equal(room.phase, 'finished');
  assert.equal(room.winnerId, player.id);
});

test('a verbal title and artist claim earns one token even after a wrong placement', () => {
  const game = new GameService(packs(Array.from({ length: 21 }, (_, index) => [1960, 2000, 2020][index % 3])));
  const { room, player: host } = game.createRoom('DJ');
  game.start(room.code, host.id); game.beginRound(room.code, host.id);
  const active = room.players[room.activeIndex];
  const existing = active.timeline[0].song.year, song = room.currentSong!.year;
  game.setTitleClaim(room.code, active.id, true);
  game.selectPosition(room.code, active.id, song < existing ? 1 : 0);
  game.confirmPosition(room.code, active.id);
  assert.equal(room.phase, 'adjudicating');
  assert.equal(game.state(room).currentSong?.id, room.currentSong?.id);
  game.adjudicateTitle(room.code, host.id, true);
  assert.equal(active.tokens, 3);
  assert.equal(room.lastResult?.titleTokenAwarded, true);
});

test('spending one token skips the current song before any guess', () => {
  const game = new GameService(packs());
  const { room, player } = game.createRoom('DJ');
  game.start(room.code, player.id); game.beginRound(room.code, player.id);
  const previousSong = room.currentSong!.id;
  game.skipSong(room.code, player.id);
  assert.equal(room.players[0].tokens, 1);
  assert.notEqual(room.currentSong!.id, previousSong);
});

test('a correct HITSTER challenge steals the song and spends one token', () => {
  const game = new GameService(packs());
  const { room, player: host } = game.createRoom('Host');
  game.joinRoom(room.code, 'Challenger');
  game.start(room.code, host.id); game.beginRound(room.code, host.id);
  const active = room.players[room.activeIndex];
  const challenger = room.players.find(player => player.id !== active.id)!;
  const existing = active.timeline[0].song.year, song = room.currentSong!.year;
  const correctPosition = song < existing ? 0 : 1, wrongPosition = correctPosition === 0 ? 1 : 0;
  game.selectPosition(room.code, active.id, wrongPosition);
  game.challengePosition(room.code, challenger.id, correctPosition);
  game.confirmPosition(room.code, active.id);
  assert.equal(room.lastResult?.cardOwnerId, challenger.id);
  assert.equal(challenger.score, 1);
  assert.equal(challenger.tokens, 1);
  assert.equal(challenger.timeline.length, 2);
  assert.equal(active.timeline.length, 1);
});

test('three tokens buy a guaranteed song and one point before listening', () => {
  const game = new GameService(packs());
  const { room, player } = game.createRoom('DJ');
  game.start(room.code, player.id);
  room.players[0].tokens = 3;
  game.buyGuaranteedCard(room.code, player.id);
  assert.equal(room.players[0].tokens, 0);
  assert.equal(room.players[0].score, 1);
  assert.equal(room.players[0].timeline.length, 2);
  assert.equal(room.lastResult?.guaranteed, true);
});

test('a room selects every pack by default and reports its song count', () => {
  const game = new GameService([
    { id: 'a', name: 'A', songs: [{ id: 'a1', artist: 'x', title: 'x', year: 2000, spotifyUri: 'spotify:track:a1' }] },
    { id: 'b', name: 'B', songs: [{ id: 'b1', artist: 'y', title: 'y', year: 2010, spotifyUri: 'spotify:track:b1' }] },
  ]);
  const { room } = game.createRoom('Host');
  assert.deepEqual(room.selectedPackIds, ['a', 'b']);
  assert.equal(game.state(room).selectedSongCount, 2);
});

test('the host can change packs and the game enforces 20 songs per player', () => {
  const game = new GameService([
    { id: 'a', name: 'A', songs: Array.from({ length: 30 }, (_, index) => ({ id: `a${index}`, artist: 'x', title: 'x', year: 1960 + index, spotifyUri: `spotify:track:a${index}` })) },
    { id: 'b', name: 'B', songs: Array.from({ length: 30 }, (_, index) => ({ id: `b${index}`, artist: 'y', title: 'y', year: 1960 + index, spotifyUri: `spotify:track:b${index}` })) },
  ]);
  const { room, player } = game.createRoom('Host');
  game.setPacks(room.code, player.id, ['a']);
  assert.deepEqual(room.selectedPackIds, ['a']);
  assert.equal(game.state(room).selectedSongCount, 30);
  game.joinRoom(room.code, 'Guest');
  assert.throws(() => game.start(room.code, player.id), /20 songs per player/);
  game.setPacks(room.code, player.id, ['a', 'b']);
  assert.equal(game.state(room).selectedSongCount, 60);
  game.start(room.code, player.id);
  assert.equal(room.phase, 'ready');
});

test('packs can only be changed by the host while in the lobby', () => {
  const game = new GameService([
    { id: 'a', name: 'A', songs: Array.from({ length: 30 }, (_, index) => ({ id: `a${index}`, artist: 'x', title: 'x', year: 1960 + index, spotifyUri: `spotify:track:a${index}` })) },
    { id: 'b', name: 'B', songs: Array.from({ length: 30 }, (_, index) => ({ id: `b${index}`, artist: 'y', title: 'y', year: 1960 + index, spotifyUri: `spotify:track:b${index}` })) },
  ]);
  const { room, player: host } = game.createRoom('Host');
  const { player: guest } = game.joinRoom(room.code, 'Guest');
  assert.throws(() => game.setPacks(room.code, guest.id, ['b']), /only the host/i);
  game.start(room.code, host.id);
  assert.throws(() => game.setPacks(room.code, host.id, ['b']), /before the game starts/);
});
