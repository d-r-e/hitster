import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCodeFromUrl, exchangeCodeForToken } from '../utils/spotify';

interface AuthContextType {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('spotify_access_token')
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      console.log('🔍 AuthContext: Checking for authorization code');
      console.log('Current URL:', window.location.href);
      
      // Check for authorization code in URL
      const code = getCodeFromUrl();
      if (code) {
        console.log('✅ Authorization code found, exchanging for token...');
        setIsLoading(true);
        
        const tokens = await exchangeCodeForToken(code);
        if (tokens) {
          console.log('✅ Token exchange successful');
          setAccessToken(tokens.access_token);
          localStorage.setItem('spotify_access_token', tokens.access_token);
          
          // Set expiration
          const expiresAt = Date.now() + tokens.expires_in * 1000;
          localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
          
          // Clean URL
          window.history.replaceState({}, document.title, '/');
        } else {
          console.error('❌ Token exchange failed');
        }
        
        setIsLoading(false);
      } else {
        console.log('ℹ️ No authorization code in URL');
      }
    };

    handleCallback();

    // Check if token is expired
    const expiresAt = localStorage.getItem('spotify_token_expires_at');
    if (expiresAt && Date.now() > parseInt(expiresAt)) {
      console.log('⚠️ Token expired, logging out');
      logout();
    }
    
    // Check for existing token
    const existingToken = localStorage.getItem('spotify_access_token');
    if (existingToken) {
      console.log('✅ Existing token found in localStorage');
    }
  }, []);

  const logout = () => {
    console.log('🚪 Logging out');
    setAccessToken(null);
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expires_at');
    localStorage.removeItem('code_verifier');
  };

  return (
    <AuthContext.Provider value={{ accessToken, setAccessToken, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
