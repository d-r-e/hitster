import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyAccessToken, hasSpotifySession, SPOTIFY_SESSION_CHANGED_EVENT, spotifyRequest } from '../lib/spotify';

declare global {
  interface Window {
    Spotify?: { Player: new (options: Record<string, unknown>) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface SpotifyPlayer {
  addListener(event: string, callback: (payload: { device_id?: string; message?: string; paused?: boolean } | null) => void): boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  togglePlay(): Promise<void>;
  activateElement(): Promise<void>;
}

export type SpotifyStatus = 'disconnected' | 'connecting' | 'ready' | 'error';
const SPOTIFY_PLAYER_SDK_URL = '/api/spotify/player-sdk.js';

export function useSpotifyPlayer(enabled: boolean) {
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceRef = useRef<string | null>(null);
  const [hasSession, setHasSession] = useState(hasSpotifySession);
  const [status, setStatus] = useState<SpotifyStatus>(hasSession ? 'connecting' : 'disconnected');
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const syncSession = () => setHasSession(hasSpotifySession());
    window.addEventListener(SPOTIFY_SESSION_CHANGED_EVENT, syncSession);
    return () => window.removeEventListener(SPOTIFY_SESSION_CHANGED_EVENT, syncSession);
  }, []);

  useEffect(() => {
    if (!enabled || !hasSession) { console.log('[Spotify] useSpotifyPlayer: effect', { enabled, hasSession, action: 'disconnected' }); setStatus('disconnected'); return; }
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    console.log('[Spotify] useSpotifyPlayer: effect starting, status connecting');
    setStatus('connecting'); setError('');
    const initialize = () => {
      if (cancelled || !window.Spotify || playerRef.current) return;
      console.log('[Spotify] useSpotifyPlayer: initialize player');
      const player = new window.Spotify.Player({ name: 'Hitster DJ', volume: 0.8, getOAuthToken: (callback: (token: string) => void) => { getSpotifyAccessToken().then(callback).catch(message => { setError(message instanceof Error ? message.message : 'Spotify authentication failed.'); setStatus('error'); }); } });
      player.addListener('ready', payload => { console.log('[Spotify] useSpotifyPlayer: ready', payload?.device_id); if (payload?.device_id) { deviceRef.current = payload.device_id; setStatus('ready'); } });
      player.addListener('not_ready', () => { console.log('[Spotify] useSpotifyPlayer: not_ready'); deviceRef.current = null; setStatus('connecting'); });
      player.addListener('player_state_changed', state => { if (state) setIsPlaying(!state.paused); });
      for (const event of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) player.addListener(event, payload => { console.error('[Spotify] useSpotifyPlayer: player error', event, payload?.message); setError(payload?.message ?? 'Spotify player error.'); setStatus('error'); });
      playerRef.current = player;
      readyTimer = setTimeout(() => { if (!cancelled && !deviceRef.current) { console.error('[Spotify] useSpotifyPlayer: ready timeout'); setError('Spotify took too long to create the player. Reconnect Spotify and try again.'); setStatus('error'); } }, 15_000);
      player.connect().then(connected => {
        console.log('[Spotify] useSpotifyPlayer: connect result', connected);
        if (!connected) { setError('Spotify rejected the player connection. Clear the Spotify session and connect again.'); setStatus('error'); }
      }).catch(() => { console.error('[Spotify] useSpotifyPlayer: connect failed'); setError('Could not connect the Spotify player.'); setStatus('error'); });
    };
    if (window.Spotify) initialize();
    else {
      console.log('[Spotify] useSpotifyPlayer: SDK not ready, waiting for onSpotifyWebPlaybackSDKReady');
      window.onSpotifyWebPlaybackSDKReady = initialize;
      if (!document.querySelector(`script[src="${SPOTIFY_PLAYER_SDK_URL}"]`)) {
        const script = document.createElement('script'); script.src = SPOTIFY_PLAYER_SDK_URL; script.async = true; script.onerror = () => { if (!cancelled) { console.error('[Spotify] useSpotifyPlayer: SDK script load failed'); setError('Could not load the Spotify player SDK.'); setStatus('error'); } }; document.body.appendChild(script);
      }
    }
    return () => { cancelled = true; if (readyTimer) clearTimeout(readyTimer); playerRef.current?.disconnect(); playerRef.current = null; deviceRef.current = null; };
  }, [enabled, hasSession]);

  const activate = useCallback(() => playerRef.current?.activateElement(), []);
  const play = useCallback(async (uri: string) => {
    const deviceId = deviceRef.current;
    console.log('[Spotify] useSpotifyPlayer: play', { uri, deviceId });
    if (!deviceId) throw new Error('Spotify player is not ready yet.');
    await playerRef.current?.activateElement();
    await spotifyRequest('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) });
    await spotifyRequest(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: 0 }) });
    setIsPlaying(true);
  }, []);
  const toggle = useCallback(async () => { await playerRef.current?.togglePlay(); }, []);

  return { status, error, isPlaying, activate, play, toggle };
}
