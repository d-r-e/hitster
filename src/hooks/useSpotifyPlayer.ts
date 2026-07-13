import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyAccessToken, hasSpotifySession, SpotifyApiError, SPOTIFY_SESSION_CHANGED_EVENT, spotifyRequest } from '../lib/spotify';

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
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

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
    let authenticationErrorTimer: ReturnType<typeof setTimeout> | undefined;
    console.log('[Spotify] useSpotifyPlayer: effect starting, status connecting');
    setStatus('connecting'); setError('');
    const initialize = () => {
      if (cancelled || !window.Spotify || playerRef.current) return;
      console.log('[Spotify] useSpotifyPlayer: initialize player');
      const player = new window.Spotify.Player({ name: 'Hitster DJ', volume: 0.8, getOAuthToken: (callback: (token: string) => void) => { getSpotifyAccessToken().then(callback).catch(message => { setError(message instanceof Error ? message.message : 'Spotify authentication failed.'); setStatus('error'); }); } });
      player.addListener('ready', payload => {
        console.log('[Spotify] useSpotifyPlayer: ready', payload?.device_id);
        if (payload?.device_id) { if (authenticationErrorTimer) clearTimeout(authenticationErrorTimer); deviceRef.current = payload.device_id; setError(''); setStatus('ready'); }
      });
      player.addListener('not_ready', () => { console.log('[Spotify] useSpotifyPlayer: not_ready'); deviceRef.current = null; setIsPlaying(false); setStatus('connecting'); });
      player.addListener('player_state_changed', state => {
        if (!state) return;
        setIsPlaying(!state.paused);
        // A valid state proves that the device is still connected. Recover from
        // any transient playback error without asking the DJ to reconnect.
        if (deviceRef.current) { setError(''); setStatus('ready'); }
      });
      for (const event of ['initialization_error', 'account_error']) player.addListener(event, payload => { console.error('[Spotify] useSpotifyPlayer: player error', event, payload?.message); setError(payload?.message ?? 'Spotify player error.'); setStatus('error'); });
      player.addListener('authentication_error', payload => {
        console.error('[Spotify] useSpotifyPlayer: authentication error', payload?.message);
        if (deviceRef.current) return;
        if (authenticationErrorTimer) clearTimeout(authenticationErrorTimer);
        authenticationErrorTimer = setTimeout(() => {
          if (!cancelled && !deviceRef.current) { setError(payload?.message ?? 'Spotify authentication failed.'); setStatus('error'); }
        }, 1_500);
      });
      // A playback command can fail while the device remains connected and a
      // track keeps playing. It is not a connection failure; the initiating
      // action already reports REST playback failures to the user.
      player.addListener('playback_error', payload => { console.error('[Spotify] useSpotifyPlayer: playback error', payload?.message); });
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
    return () => { cancelled = true; if (readyTimer) clearTimeout(readyTimer); if (authenticationErrorTimer) clearTimeout(authenticationErrorTimer); playerRef.current?.disconnect(); playerRef.current = null; deviceRef.current = null; };
  }, [enabled, hasSession]);

  const activate = useCallback(() => playerRef.current?.activateElement(), []);
  const play = useCallback(async (uri: string) => {
    await playerRef.current?.activateElement();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const deviceId = deviceRef.current;
      console.log('[Spotify] useSpotifyPlayer: play', { uri, deviceId, attempt });
      if (!deviceId) throw new Error('Spotify player is not ready yet.');
      try {
        await spotifyRequest('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) });
        // Spotify does not guarantee command ordering across Player API calls.
        // Give a newly registered Connect device time to become the target.
        await wait(150);
        // A positive value forces Spotify Connect to apply a new position instead
        // of occasionally treating zero as omitted. One millisecond is still 0:00.
        await spotifyRequest(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: 1 }) });
        setIsPlaying(true);
        return;
      } catch (error) {
        if (!(error instanceof SpotifyApiError) || error.status !== 404 || attempt === 3) throw error;
        await wait(300 * 2 ** attempt);
      }
    }
  }, []);
  const toggle = useCallback(async () => { await playerRef.current?.togglePlay(); }, []);

  return { status, error, isPlaying, activate, play, toggle };
}
