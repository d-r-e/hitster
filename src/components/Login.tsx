import { getAuthUrl } from '../utils/spotify';
import './Login.css';

export default function Login() {
  const handleLogin = async () => {
    const authUrl = await getAuthUrl();
    console.log('🔐 Redirecting to Spotify auth');
    window.location.href = authUrl;
  };

  return (
    <div className="login-container">
      <div className="neon-card">
        <div className="vinyl-logo">
          <div className="vinyl">
            <div className="vinyl-center"></div>
          </div>
        </div>
        <h1 className="neon-title">HITSTER</h1>
        <p className="subtitle">Adivina la canción</p>
        <button className="neon-button" onClick={handleLogin}>
          <span>🎵</span> Conectar con Spotify
        </button>
        <p className="info-text">Se requiere Spotify Premium</p>
      </div>
    </div>
  );
}
