import type { JoinResponse } from '../../shared/game';
const key = 'hitster-session';
export type Session = Pick<JoinResponse, 'playerId' | 'playerToken'> & { roomCode: string; localPlayerIds?: string[] };
export const loadSession = (): Session | null => { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } };
export const saveSession = (response: JoinResponse) => localStorage.setItem(key, JSON.stringify({ roomCode: response.state.roomCode, playerId: response.playerId, playerToken: response.playerToken, localPlayerIds: [] }));
export const clearSession = () => localStorage.removeItem(key);
