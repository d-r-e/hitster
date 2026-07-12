export type GamePhase = 'lobby' | 'ready' | 'listening' | 'placing' | 'adjudicating' | 'revealed' | 'finished' | 'interrupted';
export type GameDifficulty = 'easy' | 'difficult';

export interface Song {
  id: string;
  artist: string;
  title: string;
  year: number;
  spotifyUri: string;
}

export interface TimelineCard {
  id: string;
  song: Song;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  connected: boolean;
  score: number;
  tokens: number;
  timeline: TimelineCard[];
}

export interface SongPackMeta {
  id: string;
  name: string;
  count: number;
}

export interface RoundResult {
  playerId: string;
  correct: boolean;
  cardOwnerId: string;
  titleTokenAwarded?: boolean;
  guaranteed?: boolean;
}

export interface PublicChallenge {
  playerId: string;
  position: number;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  difficulty: GameDifficulty;
  players: PublicPlayer[];
  activePlayerId: string | null;
  hostPlayerId: string;
  round: number;
  winningScore: number;
  availablePacks?: SongPackMeta[];
  selectedPackIds?: string[];
  selectedSongCount?: number;
  selectedPosition?: number;
  titleClaimed?: boolean;
  challenges?: PublicChallenge[];
  lastResult?: RoundResult;
  currentSong?: Song;
  winnerId?: string;
  message?: string;
}

export interface JoinResponse {
  playerId: string;
  playerToken: string;
  state: GameState;
}
