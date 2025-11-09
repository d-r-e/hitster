# 🎵 Hitster - Juego de Adivinar Canciones

Hitster es una aplicación web móvil para jugar a adivinar canciones usando Spotify.

## 🌟 Características

- ✅ **Autenticación con Spotify** (solo front-end, sin servidor)
- 📱 **Diseño móvil moderno** con estética neón/disco
- 📸 **Escaneo de códigos QR** para cargar canciones
- 🎵 **Reproducción automática** sin mostrar información
- ✨ **Botón "Desvelar"** para revelar título, artista y año
- 📅 **Años personalizados** desde songs.csv
- 🎨 **Animaciones de vinilo giratorio**
- 🌈 **Efectos de luz disco**

## 🚀 Tecnologías

- **React 18** + **TypeScript**
- **Vite** - Build tool rápido
- **React Router** - Navegación
- **Spotify Web API** - Autenticación y datos
- **Spotify Web Playback SDK** - Reproducción
- **html5-qrcode** - Escaneo de QR
- **PapaParse** - Parseo de CSV

## 📋 Requisitos

- **Spotify Premium** (requerido para reproducción)
- Navegador moderno con soporte para cámara
- Permisos de cámara para escanear QR

## 🛠️ Instalación

```bash
# Instalar dependencias
npm install

# Copiar songs.csv a public (ya hecho)
cp songs.csv public/songs.csv

# Iniciar servidor de desarrollo
npm run dev
```

## 🔑 Configuración

El archivo `.env` ya contiene:

```
VITE_SPOTIFY_CLIENT_ID=312f0501c73a44fcb9345ebdda0c2f77
VITE_REDIRECT_URI=https://solid-robot-px7x4pvrv7f6499-5173.app.github.dev/callback
```

### ⚠️ IMPORTANTE - Configuración de la App de Spotify

En el [Dashboard de Spotify](https://developer.spotify.com/dashboard):

1. Ve a tu aplicación
2. Click en "**Edit Settings**"
3. En "**Redirect URIs**" asegúrate de que esté agregada: 
   ```
   https://solid-robot-px7x4pvrv7f6499-5173.app.github.dev/callback
   ```
4. Guarda los cambios

La aplicación usa **Implicit Grant Flow** que funciona 100% en el front-end sin necesidad de backend.

## 🎮 Cómo jugar

1. **Conectar con Spotify** - Inicia sesión con tu cuenta Premium
2. **Empezar** - Click en "Empezar" para abrir la cámara
3. **Escanear QR** - Apunta al código QR de una canción de Spotify
4. **Escuchar** - La canción se reproduce automáticamente (sin mostrar datos)
5. **Adivinar** - Intenta adivinar título, artista y año
6. **Desvelar** - Click en "Desvelar" para ver la respuesta

## 🎨 Diseño

- **Tonos oscuros**: Degradados morado oscuro (#0a0015, #1a0033)
- **Colores neón**: Magenta (#ff00ff), Cyan (#00ffff), Amarillo (#ffff00)
- **Efectos**: Glows, sombras neón, animaciones fluidas
- **Elementos**: Vinilos giratorios, luces disco flotantes

## 📁 Estructura

```
src/
├── components/        # Componentes React
│   ├── Login.tsx     # Pantalla de login con Spotify
│   ├── Home.tsx      # Menú principal
│   ├── Scanner.tsx   # Escáner de QR
│   └── Player.tsx    # Reproductor de canciones
├── context/          # Context API
│   └── AuthContext.tsx
├── utils/            # Utilidades
│   ├── spotify.ts    # Funciones de Spotify API
│   └── songs.ts      # Manejo de songs.csv
├── types/            # Tipos TypeScript
└── App.tsx           # Router principal
```

## 🔒 Autenticación

Usa **OAuth 2.0 Implicit Grant Flow** de Spotify:
- Sin backend necesario
- Token almacenado en localStorage
- Auto-logout cuando expira el token

## 📝 Notas

- Si la URL está en `songs.csv`, se muestra el año del CSV en lugar del de Spotify
- Se requiere **Spotify Premium** para reproducir canciones
- La cámara se activa automáticamente al escanear
- Funciona mejor en móviles con cámara trasera

## 🌐 Acceso

La app está disponible en:
- Local: http://localhost:5173
- GitHub Codespaces: https://solid-robot-px7x4pvrv7f6499-5173.app.github.dev

---

Desarrollado con ❤️ usando React + TypeScript + Vite