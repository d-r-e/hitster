import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { loadPacks } from './catalog.js';
import { GameService } from './game-service.js';

type Ack = (result: { ok: boolean; error?: string; songUri?: string; finished?: boolean; playerId?: string }) => void;
type Auth = { roomCode?: unknown; playerId?: unknown; playerToken?: unknown };
const app = express();
const httpServer = createServer(app);
const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()).filter(Boolean);
const isAllowedOrigin = (origin?: string) => !origin || configuredOrigins.includes(origin);
const io = new Server(httpServer, {
  cors: { origin: configuredOrigins, credentials: false },
  allowRequest: (request, callback) => callback(null, isAllowedOrigin(request.headers.origin)),
  maxHttpBufferSize: 16_384,
});
const games = new GameService(loadPacks());
const port = Number(process.env.PORT ?? 3001);
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const requests = new Map<string, { count: number; resetAt: number }>();
let spotifySdkCache: { body: string; expiresAt: number } | undefined;

function clientAddress(value: string | undefined) { return value?.split(',')[0]?.trim() || 'unknown'; }
function rateLimit(limit: number, windowMs: number): express.RequestHandler {
  return (req, res, next) => {
    const forwarded = req.headers['x-forwarded-for'];
    const address = typeof forwarded === 'string' ? clientAddress(forwarded) : req.ip;
    const key = `${req.path}:${address}`;
    const now = Date.now(), current = requests.get(key);
    if (requests.size > 10_000) for (const [requestKey, value] of requests) if (value.resetAt <= now) requests.delete(requestKey);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1; requests.set(key, entry);
    if (entry.count > limit) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    next();
  };
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://sdk.scdn.co; script-src 'self' 'unsafe-inline' https://sdk.scdn.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.spotify.com wss://*.spotify.com; img-src 'self' data: https://i.scdn.co; media-src 'self' blob: https://*.scdn.co https://*.spotify.com; worker-src 'self' blob:;");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.get('/api/spotify/player-sdk.js', async (_, res) => {
  try {
    if (!spotifySdkCache || spotifySdkCache.expiresAt <= Date.now()) {
      const response = await fetch('https://sdk.scdn.co/spotify-player.js');
      if (!response.ok) throw new Error(`Spotify SDK returned ${response.status}`);
      spotifySdkCache = { body: await response.text(), expiresAt: Date.now() + 60 * 60_000 };
    }
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(spotifySdkCache.body);
  } catch {
    res.status(502).type('text/plain').send('Spotify player SDK is temporarily unavailable.');
  }
});

function fail(res: express.Response, error: unknown) {
  const message = error instanceof Error && /^[\w .,!'-]+$/.test(error.message) ? error.message : 'Unexpected error';
  res.status(400).json({ error: message });
}
function string(value: unknown) { return typeof value === 'string' ? value : ''; }
function number(value: unknown) { return typeof value === 'number' ? value : Number.NaN; }

app.post('/api/rooms', rateLimit(10, 60_000), (req, res) => {
  try {
    const { player, room } = games.createRoom(string(req.body?.nickname));
    res.status(201).json({ playerId: player.id, playerToken: player.token, state: games.state(room) });
  } catch (error) { fail(res, error); }
});
app.post('/api/rooms/:code/join', rateLimit(20, 60_000), (req, res) => {
  try {
    const { player, room } = games.joinRoom(string(req.params.code), string(req.body?.nickname));
    res.status(201).json({ playerId: player.id, playerToken: player.token, state: games.state(room) });
  } catch (error) { fail(res, error); }
});
app.post('/api/rooms/:code/rejoin', rateLimit(30, 60_000), (req, res) => {
  try {
    const { player, room } = games.reconnect(string(req.params.code), string(req.body?.playerId), string(req.body?.playerToken));
    res.json({ playerId: player.id, playerToken: player.token, state: games.state(room) });
  } catch (error) { fail(res, error); }
});
app.post('/api/rooms/:code/local-players', rateLimit(10, 60_000), (req, res) => {
  try {
    const { player, room } = games.addLocalPlayer(string(req.params.code), string(req.body?.playerId), string(req.body?.playerToken), string(req.body?.nickname));
    res.status(201).json({ playerId: player.id, state: games.state(room) });
  } catch (error) { fail(res, error); }
});

function publish(room: ReturnType<GameService['createRoom']>['room']) {
  for (const player of room.players) io.to(`player:${player.id}`).emit('room_state', games.state(room));
}
function safeAck(value: unknown): Ack { return typeof value === 'function' ? value as Ack : () => undefined; }
function event(socket: Socket, name: string, handler: (...args: unknown[]) => { room?: ReturnType<GameService['createRoom']>['room']; songUri?: string; finished?: boolean }) {
  socket.on(name, (...args: unknown[]) => {
    const ack = safeAck(args.pop());
    const now = Date.now(), rate = socket.data.eventRate as { count: number; resetAt: number } | undefined;
    const entry = !rate || rate.resetAt <= now ? { count: 0, resetAt: now + 10_000 } : rate;
    entry.count += 1; socket.data.eventRate = entry;
    if (entry.count > 60) return ack({ ok: false, error: 'Too many actions. Please slow down.' });
    try {
      const result = handler(...args);
      if (result.room) publish(result.room);
      ack({ ok: true, songUri: result.songUri, finished: result.finished });
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' });
    }
  });
}

io.use((socket, next) => {
  const { roomCode, playerId, playerToken } = socket.handshake.auth as Auth;
  if (typeof roomCode !== 'string' || typeof playerId !== 'string' || typeof playerToken !== 'string') return next(new Error('not authorized'));
  try {
    const { room } = games.reconnect(roomCode, playerId, playerToken);
    socket.data.roomCode = room.code; socket.data.playerId = playerId;
    next();
  } catch { next(new Error('not authorized')); }
});

io.on('connection', socket => {
  const roomCode = socket.data.roomCode as string, playerId = socket.data.playerId as string;
  const { room } = games.reconnect(roomCode, playerId, (socket.handshake.auth as Auth).playerToken as string);
  socket.join(`room:${room.code}`); socket.join(`player:${playerId}`); publish(room);
  event(socket, 'start_game', () => ({ room: games.start(room.code, playerId) }));
  event(socket, 'set_packs', (ids) => {
    const selected = Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
    return { room: games.setPacks(room.code, playerId, selected) };
  });
  event(socket, 'start_round', () => {
    const next = games.beginRound(room.code, playerId);
    return { room: next, songUri: next.currentSong?.spotifyUri, finished: next.phase === 'finished' };
  });
  event(socket, 'replace_round_song', () => { const next = games.replaceRoundSong(room.code, playerId); return { room: next, songUri: next.currentSong?.spotifyUri }; });
  event(socket, 'get_current_dj_song', () => ({ songUri: games.currentDjSongUri(room.code, playerId) }));
  event(socket, 'select_position', (position, actorId) => ({ room: games.selectPosition(room.code, games.controlledPlayerId(room.code, playerId, string(actorId) || playerId), number(position)) }));
  event(socket, 'set_title_claim', (claimed, actorId) => ({ room: games.setTitleClaim(room.code, games.controlledPlayerId(room.code, playerId, string(actorId) || playerId), claimed === true) }));
  event(socket, 'challenge_position', position => ({ room: games.challengePosition(room.code, playerId, number(position)) }));
  event(socket, 'skip_song', actorId => {
    const next = games.skipSong(room.code, games.controlledPlayerId(room.code, playerId, string(actorId) || playerId));
    io.to(`player:${next.players.find(player => player.isHost)!.id}`).emit('dj_song_changed', next.currentSong?.spotifyUri);
    return { room: next };
  });
  event(socket, 'confirm_position', actorId => ({ room: games.confirmPosition(room.code, games.controlledPlayerId(room.code, playerId, string(actorId) || playerId)) }));
  event(socket, 'adjudicate_title', correct => ({ room: games.adjudicateTitle(room.code, playerId, correct === true) }));
  event(socket, 'buy_guaranteed_card', actorId => ({ room: games.buyGuaranteedCard(room.code, games.controlledPlayerId(room.code, playerId, string(actorId) || playerId)) }));
  socket.on('disconnect', async () => {
    const remainingSockets = await io.in(`player:${playerId}`).fetchSockets();
    if (remainingSockets.length > 0) return;
    const disconnected = games.disconnect(room.code, playerId);
    if (!disconnected) return;
    publish(disconnected.room);
    const timer = setTimeout(() => { const expiredRoom = games.expireDisconnect(room.code, playerId, disconnected.disconnectedAt); if (expiredRoom) publish(expiredRoom); }, 5 * 60_000);
    timer.unref();
  });
});

app.use(express.static(dist, { maxAge: '1y', immutable: true, index: false }));
app.get('/{*splat}', (_, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(dist, 'index.html')); });
httpServer.listen(port, () => console.log(`Hitster server listening on :${port}`));
