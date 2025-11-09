import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Solo mostrar modo test en URLs de desarrollo
  const isDevEnvironment = window.location.hostname.includes('app.github.dev');

  const handleStart = () => {
    navigate('/scanner');
  };

  const handleMock = () => {
    // Mock URL for testing
    const mockUrl = 'https://open.spotify.com/intl-es/track/4rFCPjKfgbEeNvs1Ku4nbd';
    console.log('🎭 Using mock URL:', mockUrl);
    navigate(`/player?url=${encodeURIComponent(mockUrl)}&t=${Date.now()}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <div className="vinyl-animation">
          <div className="vinyl large">
            <div className="vinyl-center"></div>
          </div>
        </div>
        
        <h1 className="neon-title">HITSTER</h1>
        <p className="subtitle">Davo Edition</p>
        
        <button className="neon-button primary" onClick={handleStart}>
          📸 Empezar
        </button>
        
        {isDevEnvironment && (
          <button className="neon-button mock" onClick={handleMock}>
            🎭 Modo Test
          </button>
        )}
        
        <button className="neon-button secondary" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
      
      <div className="disco-lights">
        <div className="light light-1"></div>
        <div className="light light-2"></div>
        <div className="light light-3"></div>
      </div>
    </div>
  );
}
