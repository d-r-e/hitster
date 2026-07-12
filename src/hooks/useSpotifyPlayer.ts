import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyAccessToken, hasSpotifySession, spotifyRequest } from '../lib/spotify';

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

export function useSpotifyPlayer(enabled: boolean) {
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceRef = useRef<string | null>(null);
  const [status, setStatus] = useState<SpotifyStatus>(hasSpotifySession() ? 'connecting' : 'disconnected');
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!enabled || !hasSpotifySession()) { setStatus('disconnected'); return; }
    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus('connecting'); setError('');
    const initialize = () => {
      if (cancelled || !window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({ name: 'Hitster DJ', volume: 0.8, getOAuthToken: (callback: (token: string) => void) => { getSpotifyAccessToken().then(callback).catch(message => { setError(message instanceof Error ? message.message : 'Spotify authentication failed.'); setStatus('error'); }); } });
      player.addListener('ready', payload => { if (payload?.device_id) { deviceRef.current = payload.device_id; setStatus('ready'); } });
      player.addListener('not_ready', () => { deviceRef.current = null; setStatus('connecting'); });
      player.addListener('player_state_changed', state => { if (state) setIsPlaying(!state.paused); });
      for (const event of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) player.addListener(event, payload => { setError(payload?.message ?? 'Spotify player error.'); setStatus('error'); });
      playerRef.current = player;
      readyTimer = setTimeout(() => { if (!cancelled && !deviceRef.current) { setError('Spotify took too long to create the player. Reconnect Spotify and try again.'); setStatus('error'); } }, 15_000);
      player.connect().then(connected => {
        if (!connected) { setError('Spotify rejected the player connection. Clear the Spotify session and connect again.'); setStatus('error'); }
      }).catch(() => { setError('Could not connect the Spotify player.'); setStatus('error'); });
    };
    if (window.Spotify) initialize();
    else {
      window.onSpotifyWebPlaybackSDKReady = initialize;
      if (!document.querySelector('script[src="/api/spotify/player-sdk.js"]')) {
        const script = document.createElement('script'); script.src = '/api/spotify/player-sdk.js'; script.async = true; script.onerror = () => { if (!cancelled) { setError('Could not load the Spotify player SDK.'); setStatus('error'); } }; document.body.appendChild(script);
      }
    }
    return () => { cancelled = true; if (readyTimer) clearTimeout(readyTimer); playerRef.current?.disconnect(); playerRef.current = null; deviceRef.current = null; };
  }, [enabled]);

  const activate = useCallback(() => playerRef.current?.activateElement(), []);
  const play = useCallback(async (uri: string) => {
    const deviceId = deviceRef.current;
    if (!deviceId) throw new Error('Spotify player is not ready yet.');
    await playerRef.current?.activateElement();
    await spotifyRequest('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) });
    await spotifyRequest(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: 0 }) });
    setIsPlaying(true);
  }, []);
  const toggle = useCallback(async () => { await playerRef.current?.togglePlay(); }, []);

  return { status, error, isPlaying, activate, play, toggle };
}
