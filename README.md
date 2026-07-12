# Hitster multiplayer

A mobile-first, real-time music timeline game for 1–8 players, available in Spanish and English. One player is the DJ and also plays. The DJ's Spotify Premium account supplies audio; each player owns a chronological board, while every phone follows the active player's board live.

## Local setup

1. In the Spotify developer dashboard, add this redirect URI exactly:

   ```text
   http://127.0.0.1:5173/
   ```

2. Install and start both the client and game server:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use `127.0.0.1`, not `localhost`, because OAuth storage and redirect origins must match.

The local development Spotify configuration is read from `.env.dev` (`npm run dev` starts Vite with `--mode dev`). For another Spotify application, copy `.env.example` to `.env.dev` and provide its client ID and an allow-listed redirect URI.

## Game loop

1. Create a private room and connect the DJ's Spotify Premium account.
2. Wait for “Spotify DJ — Ready to play,” then start the game. Solo rooms are supported for testing.
3. The DJ presses “Play next song.” The server selects the hidden track and playback starts on the DJ phone.
4. Placement is available immediately when the song starts. Every phone shows the active player's vertical chart, but only that player can drag the mystery vinyl—or tap a slot—to place it.
5. The DJ reveals. A correct position earns one disc. Easy mode discards failed songs; Difficult mode corrects them onto the board in chronological order.
6. The sticky score bar updates for everyone. The first player to earn 10 discs wins.

Each player starts with 2 HITSTER tokens and can hold at most 5. Naming the title and artist aloud earns one token after DJ validation, even if the timeline guess was wrong. Spend 1 to skip before guessing, spend 1 to challenge an opponent at a different slot before they confirm, or spend 3 before your turn to add a guaranteed song and point. A successful challenge steals the song and point.

If a catalog track is unavailable, the DJ can replace it before any guesses. The DJ can pause, resume, and restart playback. A disconnected player retains their seat for five minutes.

## Commands

```bash
npm run dev               # Vite client + realtime Node server
npm run build             # production client build
npm run typecheck:server  # server/shared TypeScript check
npm test                  # game-engine tests
npm run lint              # lint all source
npm run validate:songs    # validate song years/URLs
npm start                 # serve API, Socket.IO, and built client on port 3001
```

The production Node server serves `dist/` and Socket.IO from one origin. Static-only hosting such as GitHub Pages cannot run the multiplayer server.

## Production security

Serve the app only behind HTTPS and set `CLIENT_ORIGIN` to the exact public origin (for example, `https://hitster.example.com`). The bundled Nginx service is intentionally bound to localhost; put a TLS-terminating reverse proxy in front of it. Do not expose `npm run dev` to a network.
