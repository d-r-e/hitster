import type { JoinResponse } from '../../shared/game';

const base = import.meta.env.VITE_API_URL ?? '';
async function request(path: string, body: object): Promise<JoinResponse> {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}
export const createRoom = (nickname: string) => request('/api/rooms', { nickname });
export const joinRoom = (code: string, nickname: string) => request(`/api/rooms/${code}/join`, { nickname });
export const rejoinRoom = (code: string, playerId: string, playerToken: string) => request(`/api/rooms/${code}/rejoin`, { playerId, playerToken });
export async function addLocalPlayer(code: string, playerId: string, playerToken: string, nickname: string) {
  const response = await fetch(`${base}/api/rooms/${code}/local-players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId, playerToken, nickname }) });
  const data = await response.json() as { playerId?: string; state?: JoinResponse['state']; error?: string };
  if (!response.ok || !data.playerId || !data.state) throw new Error(data.error ?? 'Something went wrong.');
  return { playerId: data.playerId, state: data.state };
}
