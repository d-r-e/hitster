import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function RoomQr({ value, size = 168 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1b1026', light: '#f8f2e7' } })
      .then(url => { if (active) setSrc(url); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [value, size]);
  if (!src) return <div className="room-qr room-qr-skeleton" style={{ width: size, height: size }} />;
  return <img className="room-qr" src={src} alt="" width={size} height={size} />;
}
