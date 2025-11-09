// Hitster Game Application
class HitsterApp {
    constructor() {
        // Spotify Configuration
        this.clientId = 'YOUR_SPOTIFY_CLIENT_ID'; // Users will need to replace this
        this.redirectUri = window.location.origin + window.location.pathname;
        this.scopes = [
            'streaming',
            'user-read-email',
            'user-read-private',
            'user-read-playback-state',
            'user-modify-playback-state'
        ].join(' ');

        // App State
        this.accessToken = null;
        this.player = null;
        this.deviceId = null;
        this.currentTrack = null;
        this.songsData = [];
        this.qrScanner = null;
        this.isRevealed = false;

        // Initialize
        this.init();
    }

    async init() {
        console.log('Initializing Hitster App...');
        
        // Load songs data
        await this.loadSongsData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check for access token in URL
        this.handleAuthCallback();
        
        // Check if user is already logged in
        const storedToken = localStorage.getItem('spotify_access_token');
        const tokenExpiry = localStorage.getItem('spotify_token_expiry');
        
        if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
            this.accessToken = storedToken;
            this.onAuthenticated();
        }
    }

    setupEventListeners() {
        // Menu screen
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        document.getElementById('startBtn').addEventListener('click', () => this.showScanner());
        
        // Scanner screen
        document.getElementById('backToMenuBtn').addEventListener('click', () => this.showMenu());
        document.getElementById('submitUrlBtn').addEventListener('click', () => this.handleManualUrl());
        
        // Player screen
        document.getElementById('playPauseBtn').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('revealBtn').addEventListener('click', () => this.revealSong());
        document.getElementById('scanNextBtn').addEventListener('click', () => this.showScanner());
    }

    async loadSongsData() {
        try {
            const response = await fetch('songs.csv');
            const text = await response.text();
            const lines = text.split('\n').slice(1); // Skip header
            
            this.songsData = lines
                .filter(line => line.trim())
                .map(line => {
                    const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]+)"$/);
                    if (match) {
                        return {
                            artist: match[1],
                            title: match[2],
                            year: match[3],
                            url: match[4]
                        };
                    }
                    return null;
                })
                .filter(song => song !== null);
            
            console.log(`Loaded ${this.songsData.length} songs from CSV`);
        } catch (error) {
            console.error('Error loading songs data:', error);
        }
    }

    login() {
        const authUrl = `https://accounts.spotify.com/authorize?` +
            `client_id=${this.clientId}&` +
            `response_type=token&` +
            `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
            `scope=${encodeURIComponent(this.scopes)}&` +
            `show_dialog=true`;
        
        window.location.href = authUrl;
    }

    handleAuthCallback() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const expiresIn = params.get('expires_in');
        
        if (token) {
            this.accessToken = token;
            const expiryTime = Date.now() + (parseInt(expiresIn) * 1000);
            
            localStorage.setItem('spotify_access_token', token);
            localStorage.setItem('spotify_token_expiry', expiryTime.toString());
            
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            this.onAuthenticated();
        }
    }

    onAuthenticated() {
        console.log('User authenticated!');
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('startBtn').style.display = 'inline-block';
        
        // Initialize Spotify Player
        this.initializePlayer();
    }

    initializePlayer() {
        window.onSpotifyWebPlaybackSDKReady = () => {
            this.player = new Spotify.Player({
                name: 'Hitster Web Player',
                getOAuthToken: cb => { cb(this.accessToken); },
                volume: 0.8
            });

            // Error handling
            this.player.addListener('initialization_error', ({ message }) => {
                console.error('Initialization Error:', message);
            });

            this.player.addListener('authentication_error', ({ message }) => {
                console.error('Authentication Error:', message);
                this.logout();
            });

            this.player.addListener('account_error', ({ message }) => {
                console.error('Account Error:', message);
                alert('Se requiere Spotify Premium para usar esta aplicación');
            });

            this.player.addListener('playback_error', ({ message }) => {
                console.error('Playback Error:', message);
            });

            // Ready
            this.player.addListener('ready', ({ device_id }) => {
                console.log('Ready with Device ID', device_id);
                this.deviceId = device_id;
            });

            // Player state changed
            this.player.addListener('player_state_changed', state => {
                if (!state) return;
                
                this.currentTrack = state.track_window.current_track;
                
                // Update play/pause button
                const playPauseBtn = document.getElementById('playPauseBtn');
                playPauseBtn.textContent = state.paused ? '▶️' : '⏸️';
                
                // Update vinyl animation
                const vinyl = document.getElementById('vinyl');
                if (state.paused) {
                    vinyl.classList.remove('spinning');
                } else {
                    vinyl.classList.add('spinning');
                }
            });

            // Connect to the player
            this.player.connect();
        };
    }

    showMenu() {
        this.stopQRScanner();
        this.showScreen('menuScreen');
        this.isRevealed = false;
        document.getElementById('songInfo').classList.add('hidden');
    }

    showScanner() {
        this.showScreen('scannerScreen');
        this.startQRScanner();
        this.isRevealed = false;
        document.getElementById('songInfo').classList.add('hidden');
    }

    showPlayer() {
        this.stopQRScanner();
        this.showScreen('playerScreen');
        document.getElementById('revealBtn').style.display = 'inline-block';
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    startQRScanner() {
        if (this.qrScanner) {
            this.qrScanner.clear();
        }

        this.qrScanner = new Html5Qrcode("qrReader");
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        this.qrScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                console.log('QR Decoded:', decodedText);
                this.handleScannedUrl(decodedText);
            },
            (errorMessage) => {
                // Ignore scan errors
            }
        ).catch(err => {
            console.error('Error starting QR scanner:', err);
            alert('No se pudo acceder a la cámara. Por favor, permite el acceso a la cámara.');
        });
    }

    stopQRScanner() {
        if (this.qrScanner) {
            this.qrScanner.stop().catch(err => console.log(err));
            this.qrScanner = null;
        }
    }

    handleManualUrl() {
        const url = document.getElementById('manualUrlInput').value.trim();
        if (url) {
            this.handleScannedUrl(url);
        }
    }

    async handleScannedUrl(url) {
        // Extract Spotify track ID
        const trackId = this.extractTrackId(url);
        
        if (!trackId) {
            alert('URL de Spotify no válida');
            return;
        }

        this.showLoading(true);

        try {
            // Play the track
            await this.playTrack(trackId);
            
            // Show player screen
            this.showPlayer();
            this.isRevealed = false;
            
            // Clear manual input
            document.getElementById('manualUrlInput').value = '';
            
        } catch (error) {
            console.error('Error playing track:', error);
            alert('Error al reproducir la canción. Intenta de nuevo.');
        } finally {
            this.showLoading(false);
        }
    }

    extractTrackId(url) {
        // Extract track ID from Spotify URL
        // Format: https://open.spotify.com/track/TRACK_ID or https://open.spotify.com/intl-es/track/TRACK_ID
        const match = url.match(/spotify\.com\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    async playTrack(trackId) {
        const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to play track');
        }

        // Wait a bit for the track to load
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    togglePlayPause() {
        this.player.togglePlay();
    }

    async revealSong() {
        if (this.isRevealed) return;
        
        this.isRevealed = true;
        
        // Get current track info
        const state = await this.player.getCurrentState();
        if (!state || !state.track_window.current_track) {
            alert('No hay ninguna canción reproduciéndose');
            return;
        }

        const track = state.track_window.current_track;
        
        // Get track details from Spotify API
        const response = await fetch(`https://api.spotify.com/v1/tracks/${track.id}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });

        const trackData = await response.json();
        
        // Check if song is in CSV
        const csvSong = this.findSongInCsv(track.uri);
        
        // Display song info
        const title = track.name;
        const artist = track.artists.map(a => a.name).join(', ');
        const year = csvSong ? csvSong.year : trackData.album.release_date.substring(0, 4);
        
        document.getElementById('songTitle').textContent = title;
        document.getElementById('songArtist').textContent = artist;
        document.getElementById('songYear').textContent = year;
        document.getElementById('songInfo').classList.remove('hidden');
        document.getElementById('revealBtn').style.display = 'none';
    }

    findSongInCsv(spotifyUri) {
        // Convert URI to URL for comparison
        const trackId = spotifyUri.split(':')[2];
        return this.songsData.find(song => song.url.includes(trackId));
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    logout() {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_token_expiry');
        this.accessToken = null;
        if (this.player) {
            this.player.disconnect();
        }
        location.reload();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.hitsterApp = new HitsterApp();
});
