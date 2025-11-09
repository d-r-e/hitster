export interface Song {
  artist: string;
  title: string;
  year: string;
  url: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    images: { url: string }[];
    release_date: string;
  };
  uri: string;
}

export interface AuthTokens {
  access_token: string;
  expires_in: number;
  token_type: string;
}
