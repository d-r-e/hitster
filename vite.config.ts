import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Root path for custom domain (hitster.hacku.org)
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/spotify': {
        target: 'https://accounts.spotify.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/spotify/, '/api'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'https://accounts.spotify.com');
          });
        }
      }
    }
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  }
})
