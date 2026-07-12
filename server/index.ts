import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { loadCatalog } from './catalog.js';
import { GameService } from './game-service.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? ['http://localhost:5173'], credentials: true } });
const games = new GameService(loadCatalog());
const port = Number(process.env.PORT ?? 3001);
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

app.use(express.json());
app.get('/api/health', (_, res) => res.json({ ok: true }));

function fail(res: express.Response, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : 'Unexpected error' });
}

app.post('/api/rooms', (req, res) => {
  try {
    const { player, room } = games.createRoom(req.body.nickname ?? '');
    res.status(201).json({ playerId: player.id, playerToken: player.token, state: games.state(room) });
  } catch (error) { fail(res, error); }
});
app.post('/api/rooms/:code/join', (req, res) => {
  try {
    const { player, room } = games.joinRoom(req.params.code, req.body.nickname ?? '');
    res.status(201).json({ playerId: player.id, playerToken: player.token, state: games.state(room) });
  } catch (error) { fail(res, error); }
});
app.post('/api/rooms/:code/rejoin', (req, res) => {
  try {
    const { player, room } = games.reconnect(req.params.code, req.body.playerId, req.body.playerToken);
    res.json({ playerId: player.id, playerToken: player.token, state: games.state(room) });
  } catch (error) { fail(res, error); }
});

function publish(code: string, room: ReturnType<GameService['createRoom']>['room']) {
  for (const player of room.players) io.to(`player:${player.id}`).emit('room_state', games.state(room));
}

io.on('connection', socket => {
  const { roomCode, playerId, playerToken } = socket.handshake.auth as Record<string, string>;
  if (!roomCode || !playerId || !playerToken) return socket.disconnect();
  let room;
  try { ({ room } = games.reconnect(roomCode, playerId, playerToken)); }
  catch { return socket.disconnect(); }
  socket.join(`room:${room.code}`); socket.join(`player:${playerId}`); publish(room.code, room);
  socket.on('start_game', ack => { try { const next = games.start(room.code, playerId); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('start_round', ack => { try { const next = games.beginRound(room.code, playerId); publish(room.code, next); ack({ ok: true, songUri: next.currentSong?.spotifyUri }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('replace_round_song', ack => { try { const next = games.replaceRoundSong(room.code, playerId); publish(room.code, next); ack({ ok: true, songUri: next.currentSong?.spotifyUri }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('get_current_dj_song', ack => { try { ack({ ok: true, songUri: games.currentDjSongUri(room.code, playerId) }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('select_position', (position: number, ack) => { try { const next = games.selectPosition(room.code, playerId, position); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('set_title_claim', (claimed: boolean, ack) => { try { const next = games.setTitleClaim(room.code, playerId, claimed); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('challenge_position', (position: number, ack) => { try { const next = games.challengePosition(room.code, playerId, position); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('skip_song', ack => { try { const next = games.skipSong(room.code, playerId); publish(room.code, next); io.to(`player:${next.players.find(player => player.isHost)!.id}`).emit('dj_song_changed', next.currentSong?.spotifyUri); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('confirm_position', ack => { try { const next = games.confirmPosition(room.code, playerId); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('adjudicate_title', (correct: boolean, ack) => { try { const next = games.adjudicateTitle(room.code, playerId, correct); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('buy_guaranteed_card', ack => { try { const next = games.buyGuaranteedCard(room.code, playerId); publish(room.code, next); ack({ ok: true }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); } });
  socket.on('disconnect', async () => {
    const remainingSockets = await io.in(`player:${playerId}`).fetchSockets();
    if (remainingSockets.length > 0) return;
    const disconnected = games.disconnect(room.code, playerId);
    publish(room.code, room);
    if (!disconnected) return;
    const timer = setTimeout(() => {
      const expiredRoom = games.expireDisconnect(room.code, playerId, disconnected.disconnectedAt);
      if (expiredRoom) publish(room.code, expiredRoom);
    }, 5 * 60_000);
    timer.unref();
  });
});

app.use(express.static(dist));
app.get('/{*splat}', (_, res) => res.sendFile(path.join(dist, 'index.html')));
httpServer.listen(port, () => console.log(`Hitster server listening on :${port}`));
