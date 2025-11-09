import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Home from './components/Home';
import Scanner from './components/Scanner';
import Player from './components/Player';
import './App.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  return accessToken ? <>{children}</> : <Navigate to="/" />;
}

function CallbackHandler() {
  const { accessToken, isLoading } = useAuth();
  console.log('📍 Callback handler - Token:', accessToken ? 'Present' : 'Not found', '- Loading:', isLoading);
  
  // Show loading state while processing
  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0015 0%, #1a0033 50%, #0f001f 100%)',
        color: '#00ffff',
        fontSize: '1.5rem',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div className="vinyl loading" style={{ width: '100px', height: '100px', animation: 'spin 2s linear infinite' }}>
          <div className="vinyl-center"></div>
        </div>
        Procesando autenticación...
      </div>
    );
  }
  
  // Redirect to home if we have a token
  if (accessToken) {
    return <Navigate to="/home" />;
  }
  
  // Give a moment for the auth context to process
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0015 0%, #1a0033 50%, #0f001f 100%)',
      color: '#00ffff',
      fontSize: '1.5rem'
    }}>
      Verificando autenticación...
    </div>
  );
}

function AppRoutes() {
  const { accessToken } = useAuth();

  return (
    <Routes>
      <Route path="/" element={accessToken ? <Navigate to="/home" /> : <Login />} />
      <Route path="/callback" element={<CallbackHandler />} />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scanner"
        element={
          <ProtectedRoute>
            <Scanner />
          </ProtectedRoute>
        }
      />
      <Route
        path="/player"
        element={
          <ProtectedRoute>
            <Player />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
