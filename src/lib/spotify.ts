const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) || (import.meta.env.VITE_REDIRECT_URI as string | undefined) || `${window.location.origin}/`;
const TOKEN_KEY = 'hitster-spotify-tokens';
const VERIFIER_KEY = 'hitster-spotify-verifier';
const RETURN_URL_KEY = 'hitster-spotify-return-url';
const STATE_KEY = 'hitster-spotify-state';
const AUTH_VERSION = 2;
export const SPOTIFY_SESSION_CHANGED_EVENT = 'hitster-spotify-session-changed';
// Spotify's Web Playback SDK requires these three scopes even though this app
// does not read profile data. Player API commands additionally require modify.
const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-modify-playback-state'].join(' ');

export class SpotifyApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
  }
}

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
  authVersion: number;
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
  try {
    const value = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as Partial<SpotifyTokens> | null;
    if (!value || value.authVersion !== AUTH_VERSION || typeof value.accessToken !== 'string' || !value.accessToken || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null;
    if (value.refreshToken !== undefined && typeof value.refreshToken !== 'string') return null;
    return { accessToken: value.accessToken, expiresAt: value.expiresAt, authVersion: AUTH_VERSION, ...(value.refreshToken ? { refreshToken: value.refreshToken } : {}) };
  }
  catch { return null; }
}

function writeTokens(tokens: SpotifyTokens) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  window.dispatchEvent(new Event(SPOTIFY_SESSION_CHANGED_EVENT));
}

export function spotifyConfigured() {
  return Boolean(CLIENT_ID);
}

export function hasSpotifySession() {
  return Boolean(readTokens());
}

export async function redirectToSpotify() {
  console.log('[Spotify] redirectToSpotify: starting login', { CLIENT_ID: Boolean(CLIENT_ID), REDIRECT_URI });
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured.');
  try {
    const verifier = randomString(96);
    const state = randomString(32);
    const challenge = await challengeFor(verifier);
    console.log('[Spotify] redirectToSpotify: generated PKCE', { hasSecureContext: window.isSecureContext, hasSubtle: Boolean(crypto?.subtle) });
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_URL_KEY, `${window.location.pathname}${window.location.search}`);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    console.log('[Spotify] redirectToSpotify: redirecting to authorize', { redirectUri: REDIRECT_URI, scopes: SCOPES });
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
  } catch (error) {
    console.error('[Spotify] redirectToSpotify: failed', error);
    throw new Error(`Could not start Spotify login. Redirect URI: ${REDIRECT_URI}. ${errorDetail(error)}`);
  }
}

let callbackPromise: Promise<boolean> | null = null;

async function processSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const callbackState = params.get('state');
  const oauthError = params.get('error');
  const oauthDescription = params.get('error_description');
  console.log('[Spotify] processSpotifyCallback: invoked', { hasCode: Boolean(code), hasState: Boolean(callbackState), error: oauthError, errorDescription: oauthDescription });
  if (oauthError) {
    const returnUrl = sessionStorage.getItem(RETURN_URL_KEY) ?? '/';
    sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(STATE_KEY); sessionStorage.removeItem(RETURN_URL_KEY);
    window.history.replaceState({}, '', returnUrl);
    throw new Error(`Spotify authorization failed: ${oauthError}${oauthDescription ? ` — ${oauthDescription}` : ''}. Redirect URI: ${REDIRECT_URI}`);
  }
  if (!code) { console.log('[Spotify] processSpotifyCallback: no code, not a callback'); return false; }
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured.');
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  console.log('[Spotify] processSpotifyCallback: state check', { hasVerifier: Boolean(verifier), hasExpectedState: Boolean(expectedState), stateMatches: Boolean(callbackState && expectedState && callbackState === expectedState) });
  if (!verifier) throw new Error('Spotify login session expired. Try connecting again.');
  if (!callbackState || !expectedState || callbackState !== expectedState) { disconnectSpotify(); throw new Error('Spotify login state did not match. Try connecting again.'); }
  console.log('[Spotify] processSpotifyCallback: exchanging code for tokens');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
  });
  console.log('[Spotify] processSpotifyCallback: token response', { ok: response.ok, status: response.status });
  if (!response.ok) throw new Error(`Spotify did not accept the authorization callback (${await spotifyErrorResponse(response)}). Confirm that ${REDIRECT_URI} exactly matches a Redirect URI in the Spotify Dashboard.`);
  const data = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in)) throw new Error('Spotify returned an invalid token response. Connect again.');
  if (data.refresh_token !== undefined && typeof data.refresh_token !== 'string') throw new Error('Spotify returned an invalid refresh token. Connect again.');
  console.log('[Spotify] processSpotifyCallback: tokens received', { hasAccessToken: Boolean(data.access_token), hasRefreshToken: Boolean(data.refresh_token), expiresIn: data.expires_in });
  writeTokens({ accessToken: data.access_token, ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}), expiresAt: Date.now() + data.expires_in * 1000, authVersion: AUTH_VERSION });
  sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(STATE_KEY);
  const returnUrl = sessionStorage.getItem(RETURN_URL_KEY) ?? '/';
  sessionStorage.removeItem(RETURN_URL_KEY);
  window.history.replaceState({}, '', returnUrl);
  console.log('[Spotify] processSpotifyCallback: done, returnUrl', returnUrl);
  return true;
}

export function finishSpotifyCallback() {
  console.log('[Spotify] finishSpotifyCallback: called', { alreadyRunning: Boolean(callbackPromise) });
  // React Strict Mode intentionally runs effects twice in development. A
  // Spotify authorization code is single-use, so share one token exchange.
  callbackPromise ??= processSpotifyCallback();
  return callbackPromise;
}

let refreshPromise: Promise<string> | null = null;

async function refreshSpotifyAccessToken(tokens: SpotifyTokens) {
  if (!CLIENT_ID || !tokens.refreshToken) { disconnectSpotify(); throw new Error('Spotify login expired. Connect again.'); }
  console.log('[Spotify] getSpotifyAccessToken: refreshing token');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
  });
  console.log('[Spotify] getSpotifyAccessToken: refresh response', { ok: response.ok, status: response.status });
  if (!response.ok) {
    const detail = await spotifyErrorResponse(response);
    const credentialsRejected = response.status === 400 || response.status === 401;
    if (credentialsRejected) disconnectSpotify();
    throw new Error(`Spotify login refresh failed (${detail}). ${credentialsRejected ? 'Connect again.' : 'Try again in a moment.'}`);
  }
  const data = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in)) { disconnectSpotify(); throw new Error('Spotify returned an invalid refresh response. Connect again.'); }
  if (data.refresh_token !== undefined && typeof data.refresh_token !== 'string') { disconnectSpotify(); throw new Error('Spotify returned an invalid refresh token. Connect again.'); }
  const refreshed: SpotifyTokens = { accessToken: data.access_token, refreshToken: data.refresh_token || tokens.refreshToken, expiresAt: Date.now() + data.expires_in * 1000, authVersion: AUTH_VERSION };
  writeTokens(refreshed);
  console.log('[Spotify] getSpotifyAccessToken: refreshed');
  return refreshed.accessToken;
}

export async function getSpotifyAccessToken(forceRefresh = false) {
  const tokens = readTokens();
  console.log('[Spotify] getSpotifyAccessToken: called', { hasTokens: Boolean(tokens), expiresAt: tokens?.expiresAt, now: Date.now() });
  if (!tokens) throw new Error('Connect Spotify first.');
  if (!forceRefresh && tokens.expiresAt > Date.now() + 60_000) { console.log('[Spotify] getSpotifyAccessToken: token still valid'); return tokens.accessToken; }
  refreshPromise ??= refreshSpotifyAccessToken(tokens).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export function disconnectSpotify() {
  sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(STATE_KEY); sessionStorage.removeItem(RETURN_URL_KEY);
  window.dispatchEvent(new Event(SPOTIFY_SESSION_CHANGED_EVENT));
}

export async function spotifyRequest(path: string, init: RequestInit = {}) {
  console.log('[Spotify] spotifyRequest:', init.method ?? 'GET', path);
  const request = async (token: string) => fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  let response = await request(await getSpotifyAccessToken());
  if (response.status === 401) response = await request(await getSpotifyAccessToken(true));
  console.log('[Spotify] spotifyRequest: response', { method: init.method ?? 'GET', path, status: response.status });
  if (response.status === 401) throw new SpotifyApiError(401, 'Spotify login expired. Connect again.');
  if (response.status === 403) throw new SpotifyApiError(403, 'Spotify Premium is required for playback.');
  if (response.status === 429) throw new SpotifyApiError(429, 'Spotify is rate limiting playback. Wait a moment and retry.');
  if (!response.ok) throw new SpotifyApiError(response.status, `Spotify playback failed (${await spotifyErrorResponse(response)}).`);
  return response;
}
