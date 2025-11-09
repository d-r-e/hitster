import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { extractTrackId, getTrackInfo } from '../utils/spotify';
import { loadSongs, findSongByUrl } from '../utils/songs';
import type { SpotifyTrack, Song } from '../types';
import './Player.css';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

export default function Player() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [trackInfo, setTrackInfo] = useState<SpotifyTrack | null>(null);
  const [csvSong, setCsvSong] = useState<Song | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const scriptLoaded = useRef(false);

  const trackUrl = searchParams.get('url');

  useEffect(() => {
    console.log('🎵 Player mounted');
    console.log('Track URL:', trackUrl);
    console.log('Access Token:', accessToken ? 'Present' : 'Missing');
    
    if (!trackUrl || !accessToken) {
      console.error('❌ Missing trackUrl or accessToken, redirecting to home');
      navigate('/home');
      return;
    }

    loadTrackInfo();
    initializePlayer();

    return () => {
      console.log('🔌 Player unmounting, disconnecting player');
      if (player) {
        player.disconnect();
      }
    };
  }, [trackUrl, accessToken]);

  const loadTrackInfo = async () => {
    if (!trackUrl) return;

    console.log('📡 Loading track info...');
    const trackId = extractTrackId(trackUrl);
    console.log('Track ID:', trackId);
    
    if (!trackId) {
      console.error('❌ Invalid track ID');
      setError('URL de Spotify inválida');
      return;
    }

    const info = await getTrackInfo(trackId, accessToken!);
    if (info) {
      console.log('✅ Track info loaded:', info.name);
      setTrackInfo(info);
    } else {
      setError('No se pudo cargar la canción');
    }

    const songs = await loadSongs();
    const song = findSongByUrl(trackUrl, songs);
    if (song) {
      setCsvSong(song);
    }
  };

  const initializePlayer = () => {
    console.log('🎧 Initializing Spotify Player...');
    
    // Check if SDK is already loaded and ready
    if (window.Spotify) {
      console.log('✅ Spotify SDK already available, setting up player');
      setupPlayer();
      return;
    }
    
    if (scriptLoaded.current) {
      console.log('⏳ Script loading, waiting for SDK...');
      return;
    }

    console.log('📜 Loading Spotify Web Playback SDK script');
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    scriptLoaded.current = true;

    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log('✅ Spotify Web Playback SDK Ready');
      setupPlayer();
    };
  };

  const setupPlayer = () => {
    console.log('🔧 Setting up Spotify Player instance...');
    
    if (!window.Spotify) {
      console.error('❌ Spotify SDK not available');
      setError('Error: SDK de Spotify no disponible');
      setLoading(false);
      return;
    }
    
    const spotifyPlayer = new window.Spotify.Player({
      name: 'Hitster Player',
      getOAuthToken: (cb: (token: string) => void) => {
        cb(accessToken!);
      },
      volume: 0.8
    });

    spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('✅ Spotify Player Ready! Device ID:', device_id);
      setDeviceId(device_id);
      setLoading(false);
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      console.log('⚠️ Device ID has gone offline:', device_id);
    });

    spotifyPlayer.addListener('player_state_changed', (state: any) => {
      if (!state) return;
      console.log('🎵 Player state changed. Playing:', !state.paused);
      setIsPlaying(!state.paused);
    });

    spotifyPlayer.addListener('initialization_error', ({ message }: any) => {
      console.error('❌ Initialization Error:', message);
      setError('Error al inicializar el reproductor');
      setLoading(false);
    });

    spotifyPlayer.addListener('authentication_error', ({ message }: any) => {
      console.error('❌ Authentication Error:', message);
      setError('Error de autenticación. Intenta volver a hacer login');
      setLoading(false);
    });

    spotifyPlayer.addListener('account_error', ({ message }: any) => {
      console.error('❌ Account Error:', message);
      setError('Se requiere Spotify Premium');
      setLoading(false);
    });

    spotifyPlayer.addListener('playback_error', ({ message }: any) => {
      console.error('❌ Playback Error:', message);
    });

    console.log('🔌 Connecting to Spotify...');
    spotifyPlayer.connect();
    setPlayer(spotifyPlayer);
  };

  const playTrack = async () => {
    if (!deviceId || !trackInfo) {
      console.log('⚠️ Cannot play: deviceId or trackInfo missing');
      return;
    }

    console.log('▶️ Playing track:', trackInfo.name);

    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [trackInfo.uri]
        })
      });
      
      if (!response.ok) {
        console.error('❌ Failed to play track:', response.status);
      } else {
        console.log('✅ Track started playing');
      }
    } catch (err) {
      console.error('❌ Error playing track:', err);
      setError('Error al reproducir la canción');
    }
  };

  const togglePlay = () => {
    if (!player) return;
    player.togglePlay();
  };

  const handleReveal = () => {
    setRevealed(true);
  };

  const handleNewScan = () => {
    if (player) {
      player.disconnect();
    }
    navigate('/scanner');
  };

  const handleBack = () => {
    if (player) {
      player.disconnect();
    }
    navigate('/home');
  };

  useEffect(() => {
    if (deviceId && trackInfo) {
      console.log('🎵 Device and track ready, auto-playing...');
      console.log('Device ID:', deviceId);
      console.log('Track:', trackInfo.name);
      // Auto-play when ready
      setTimeout(() => {
        console.log('⏰ Timeout reached, calling playTrack()');
        playTrack();
      }, 1000);
    }
  }, [deviceId, trackInfo]);

  const getYear = () => {
    if (csvSong) {
      return csvSong.year;
    }
    return trackInfo?.album.release_date.split('-')[0] || 'N/A';
  };

  if (error) {
    return (
      <div className="player-container">
        <div className="error-screen">
          <h2 className="error-title">⚠️ Error</h2>
          <p className="error-text">{error}</p>
          <button className="neon-button" onClick={handleBack}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (loading || !trackInfo) {
    return (
      <div className="player-container">
        <div className="loading-screen">
          <div className="vinyl loading">
            <div className="vinyl-center"></div>
          </div>
          <p className="loading-text">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="player-container">
      <div className="player-header">
        <button className="back-button" onClick={handleBack}>
          ← Volver
        </button>
      </div>

      <div className="player-content">
        <div className={`vinyl-player ${isPlaying ? 'playing' : ''}`}>
          <div className="vinyl">
            <div className="vinyl-center"></div>
          </div>
        </div>

        <div className="track-info">
          {!revealed ? (
            <>
              <div className="hidden-info">
                <p className="mystery-text">🎵 ¿Qué canción es?</p>
              </div>
              <button className="neon-button reveal-button" onClick={handleReveal}>
                ✨ Desvelar
              </button>
            </>
          ) : (
            <div className="revealed-info">
              <h2 className="track-title">{trackInfo.name}</h2>
              <p className="track-artist">{trackInfo.artists.map(a => a.name).join(', ')}</p>
              <p className="track-year">📅 {getYear()}</p>
            </div>
          )}
        </div>

        <div className="player-controls">
          <button className="control-button" onClick={togglePlay}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
        </div>

        <button className="neon-button secondary" onClick={handleNewScan}>
          📸 Nueva canción
        </button>
      </div>
    </div>
  );
}
