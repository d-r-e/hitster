import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import './Scanner.css';

export default function Scanner() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const hasNavigated = useRef(false);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      if (!mounted || isScanning || scannerRef.current) return;

      try {
        const scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          onScanSuccess,
          onScanError
        );
        
        if (mounted) {
          setIsScanning(true);
          console.log('✅ QR Scanner started');
        }
      } catch (err) {
        console.error('Error starting scanner:', err);
        if (mounted) {
          setError('No se pudo acceder a la cámara');
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      stopScanner();
    };
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        console.log('🛑 QR Scanner stopped');
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const onScanSuccess = (decodedText: string) => {
    if (hasNavigated.current) return; // Prevent multiple navigations
    
    console.log('📷 QR Scanned:', decodedText);
    
    if (decodedText.includes('spotify.com/track/') || decodedText.includes('open.spotify.com')) {
      console.log('✅ Valid Spotify URL detected');
      hasNavigated.current = true;
      stopScanner().then(() => {
        // Add timestamp to force component remount
        navigate(`/player?url=${encodeURIComponent(decodedText)}&t=${Date.now()}`);
      });
    } else {
      console.log('⚠️ Not a Spotify track URL');
    }
  };

  const onScanError = () => {
    // Ignore scan errors (happens frequently while scanning)
  };

  const handleBack = () => {
    stopScanner();
    navigate('/home');
  };

  return (
    <div className="scanner-container">
      <div className="scanner-header">
        <button className="back-button" onClick={handleBack}>
          ← Volver
        </button>
        <h2 className="scanner-title">Escanea el QR</h2>
      </div>

      <div className="scanner-content">
        <div id="qr-reader" className="qr-reader"></div>
        {error && <p className="error-message">{error}</p>}
        <p className="scanner-hint">Apunta la cámara al código QR de Spotify</p>
      </div>

      <div className="scanner-decoration">
        <div className="scan-line"></div>
      </div>
    </div>
  );
}
