import type { AuthTokens, SpotifyTrack } from '../types';

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state'
].join(' ');

// PKCE Helper Functions
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64encode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export const getAuthUrl = async (): Promise<string> => {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  // Store code verifier for later use
  localStorage.setItem('code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log('🔐 Auth URL:', authUrl);
  return authUrl;
};

export const exchangeCodeForToken = async (code: string): Promise<AuthTokens | null> => {
  const codeVerifier = localStorage.getItem('code_verifier');
  
  if (!codeVerifier) {
    console.error('❌ Code verifier not found');
    return null;
  }

  console.log('� Exchanging code for token...');

  try {
    const response = await fetch('/api/spotify/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token exchange failed:', response.status, errorText);
      throw new Error(`Failed to exchange code: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Token received successfully');
    
    // Clean up code verifier
    localStorage.removeItem('code_verifier');
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    };
  } catch (error) {
    console.error('❌ Error exchanging code for token:', error);
    return null;
  }
};

export const getCodeFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  
  if (error) {
    console.error('❌ OAuth error:', error);
    return null;
  }

  if (code) {
    console.log('✅ Authorization code found');
    return code;
  }
  
  return null;
};

export const getTrackInfo = async (trackId: string, accessToken: string): Promise<SpotifyTrack | null> => {
  try {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch track');
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching track:', error);
    return null;
  }
};

export const extractTrackId = (url: string): string | null => {
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
};
