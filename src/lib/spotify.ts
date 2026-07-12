const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) || (import.meta.env.VITE_REDIRECT_URI as string | undefined) || `${window.location.origin}/`;
const TOKEN_KEY = 'hitster-spotify-tokens';
const VERIFIER_KEY = 'hitster-spotify-verifier';
const RETURN_URL_KEY = 'hitster-spotify-return-url';
const SCOPES = ['streaming', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state'].join(' ');

function errorDetail(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function spotifyErrorResponse(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const body = await response.json() as { error?: string | { message?: string }; error_description?: string };
    const message = typeof body.error === 'object' ? body.error.message : body.error_description ?? body.error;
    return message ? `${fallback} — ${message}` : fallback;
  } catch {
    return fallback;
  }
}

interface SpotifyTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

function randomString(length: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), value => alphabet[value % alphabet.length]).join('');
}

async function challengeFor(verifier: string) {
  if (!window.isSecureContext || !crypto?.subtle) {
    throw new Error(`Spotify login needs a secure browser context to generate PKCE credentials. This page is ${window.location.origin}. Use HTTPS, or open the app through http://localhost:5173 on this device.`);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readTokens(): SpotifyTokens | null {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null'); }
  catch { return null; }
}

function writeTokens(tokens: SpotifyTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function spotifyConfigured() {
  return Boolean(CLIENT_ID);
}

export function hasSpotifySession() {
  return Boolean(readTokens());
}

export async function redirectToSpotify() {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured.');
  try {
    const verifier = randomString(96);
    const challenge = await challengeFor(verifier);
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(RETURN_URL_KEY, `${window.location.pathname}${window.location.search}`);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  } catch (error) {
    throw new Error(`Could not start Spotify login. Redirect URI: ${REDIRECT_URI}. ${errorDetail(error)}`);
  }
}

let callbackPromise: Promise<boolean> | null = null;

async function processSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const oauthError = params.get('error');
  const oauthDescription = params.get('error_description');
  if (oauthError) throw new Error(`Spotify authorization failed: ${oauthError}${oauthDescription ? ` — ${oauthDescription}` : ''}. Redirect URI: ${REDIRECT_URI}`);
  if (!code) return false;
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured.');
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('Spotify login session expired. Try connecting again.');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
  });
  if (!response.ok) throw new Error(`Spotify did not accept the authorization callback (${await spotifyErrorResponse(response)}). Confirm that ${REDIRECT_URI} exactly matches a Redirect URI in the Spotify Dashboard.`);
  const data = await response.json();
  writeTokens({ accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 });
  localStorage.removeItem(VERIFIER_KEY);
  const returnUrl = localStorage.getItem(RETURN_URL_KEY) ?? '/';
  localStorage.removeItem(RETURN_URL_KEY);
  window.history.replaceState({}, '', returnUrl);
  return true;
}

export function finishSpotifyCallback() {
  // React Strict Mode intentionally runs effects twice in development. A
  // Spotify authorization code is single-use, so share one token exchange.
  callbackPromise ??= processSpotifyCallback();
  return callbackPromise;
}

export async function getSpotifyAccessToken() {
  const tokens = readTokens();
  if (!tokens) throw new Error('Connect Spotify first.');
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  if (!CLIENT_ID || !tokens.refreshToken) { disconnectSpotify(); throw new Error('Spotify login expired. Connect again.'); }
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
  });
  if (!response.ok) { const detail = await spotifyErrorResponse(response); disconnectSpotify(); throw new Error(`Spotify login refresh failed (${detail}). Connect again.`); }
  const data = await response.json();
  const refreshed = { accessToken: data.access_token, refreshToken: data.refresh_token ?? tokens.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
  writeTokens(refreshed);
  return refreshed.accessToken;
}

export function disconnectSpotify() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function spotifyRequest(path: string, init: RequestInit = {}) {
  const token = await getSpotifyAccessToken();
  const response = await fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  if (response.status === 401) throw new Error('Spotify login expired. Connect again.');
  if (response.status === 403) throw new Error('Spotify Premium is required for playback.');
  if (response.status === 429) throw new Error('Spotify is rate limiting playback. Wait a moment and retry.');
  if (!response.ok) throw new Error(`Spotify playback failed (${await spotifyErrorResponse(response)}).`);
  return response;
}
