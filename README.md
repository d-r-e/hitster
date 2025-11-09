# 🎵 Hitster - Juego de Fiesta Musical

Hitster es un juego de fiesta sobre adivinar canciones. La aplicación web móvil usa la API de Spotify para reproducir canciones y permite a los jugadores escanear códigos QR para revelar las canciones.

## 🎮 Características

- **Autenticación con Spotify**: Requiere cuenta Spotify Premium
- **Escaneo de QR**: Escanea códigos QR con URLs de Spotify
- **Reproducción automática**: Las canciones se reproducen automáticamente sin mostrar información
- **Animación de vinilo**: Icono de vinilo girando durante la reproducción
- **Controles de reproducción**: Play/Pausa de las canciones
- **Botón "Desvelar"**: Revela el título, artista y año de la canción
- **Datos personalizados**: Usa años del archivo CSV cuando la canción está en la lista

## 🚀 Configuración

### 1. Registrar aplicación en Spotify

1. Ve a [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Crea una nueva aplicación
3. Anota el **Client ID**
4. En la configuración de la app, añade tu URL de redirect (por ejemplo: `http://localhost:8000/` o tu dominio)

### 2. Configurar la aplicación

Edita el archivo `app.js` y reemplaza `YOUR_SPOTIFY_CLIENT_ID` con tu Client ID:

```javascript
this.clientId = 'tu_client_id_aqui';
```

### 3. Ejecutar la aplicación

La aplicación necesita ser servida a través de un servidor web. Puedes usar cualquiera de estos métodos:

**Opción 1: Python**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

**Opción 2: Node.js (http-server)**
```bash
npx http-server -p 8000
```

**Opción 3: PHP**
```bash
php -S localhost:8000
```

Luego abre tu navegador en `http://localhost:8000`

### 4. Usar en móvil

Para usar la aplicación en tu móvil:

1. Asegúrate de que tu móvil y ordenador están en la misma red
2. Encuentra la IP local de tu ordenador
3. En Spotify Dashboard, añade `http://TU_IP:8000/` a las URIs de redirección
4. Abre `http://TU_IP:8000/` en el navegador de tu móvil

## 📱 Cómo jugar

1. **Conectar con Spotify**: Haz clic en "Conectar con Spotify" e inicia sesión
2. **Empezar**: Presiona "Empezar" para abrir la cámara
3. **Escanear QR**: Escanea un código QR con una URL de Spotify o pega la URL manualmente
4. **Escuchar**: La canción comenzará a reproducirse automáticamente
5. **Desvelar**: Presiona "Desvelar" para ver el título, artista y año
6. **Siguiente**: Escanea el siguiente QR para continuar jugando

## 📋 Notas

- La aplicación usa la API de Spotify para loguear al usuario (se necesita Spotify Premium)
- El juego consiste en escanear QRs a URLs de spotify
- Una vez escaneada, la canción se comienza a reproducir automáticamente pero no se muestra ni el título ni el artista ni el año
- El menú muestra el botón "Empezar" y de ahí abre directamente la cámara para escanear el QR
- Ante una URL válida, la canción se reproduce automáticamente pero no se muestra ninguna información sobre la canción
- Existe un Botón "desvelar" que se muestra junto al icono del vinilo girando. La canción se puede parar o continuar
- Al desvelar se muestra el Título, Artista y año
- Si la url está entre las canciones de songs.csv, se debe mostrar el año del csv, no el que muestra Spotify

## 🛠️ Tecnologías utilizadas

- **HTML5/CSS3/JavaScript**: Frontend vanilla (sin frameworks)
- **Spotify Web API**: Autenticación y obtención de datos de canciones
- **Spotify Web Playback SDK**: Reproducción de música en el navegador
- **html5-qrcode**: Escaneo de códigos QR
- **CSS Grid/Flexbox**: Diseño responsive para móviles

## 📄 Estructura de archivos

```
hitster/
├── index.html      # Estructura HTML principal
├── styles.css      # Estilos CSS responsive
├── app.js          # Lógica de la aplicación
├── songs.csv       # Base de datos de canciones con años personalizados
└── README.md       # Este archivo
```

## 🎨 Características de diseño

- Interfaz optimizada para móviles
- Animaciones suaves y transiciones
- Tema gradient moderno (púrpura)
- Iconos emoji para mejor UX
- Diseño responsive que se adapta a diferentes tamaños de pantalla

## 🔒 Seguridad y privacidad

- La autenticación se realiza mediante OAuth 2.0 de Spotify
- Los tokens de acceso se almacenan localmente en el navegador
- No se almacenan credenciales de usuario
- La aplicación solo solicita permisos necesarios para la reproducción

## 📝 Licencia

Este proyecto es de código abierto.