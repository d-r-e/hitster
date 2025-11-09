# 📱 Instalación como App (PWA)

## ¿Qué es una PWA?

Hitster es una Progressive Web App (PWA), lo que significa que puedes instalarla en tu dispositivo y usarla como una aplicación nativa, con las siguientes ventajas:

- ✅ Acceso directo desde la pantalla de inicio
- ✅ Funciona en pantalla completa (sin barra del navegador)
- ✅ Carga más rápida
- ✅ Funciona parcialmente offline

## 📲 Cómo instalar

### En Android (Chrome/Edge)

1. Visita https://hitster.hacku.org
2. Toca el menú (⋮) en la esquina superior derecha
3. Selecciona **"Agregar a pantalla de inicio"** o **"Instalar app"**
4. Confirma la instalación
5. ¡Listo! Ahora verás el icono de Hitster en tu pantalla de inicio

### En iPhone/iPad (Safari)

1. Visita https://hitster.hacku.org
2. Toca el botón de compartir (□↑)
3. Desplázate hacia abajo y selecciona **"Agregar a pantalla de inicio"**
4. Personaliza el nombre si lo deseas
5. Toca **"Agregar"**
6. ¡Listo! Ahora verás el icono de Hitster en tu pantalla de inicio

### En Desktop (Chrome/Edge)

1. Visita https://hitster.hacku.org
2. Busca el icono de instalar (⊕) en la barra de direcciones
3. Haz clic en **"Instalar"**
4. La app se abrirá en su propia ventana
5. ¡Listo! Puedes acceder a Hitster desde tu menú de aplicaciones

## 🎨 Iconos

Los iconos de la aplicación se generan automáticamente:

```bash
npm run generate-icons
```

Esto crea:
- `icon-192.png` - Icono pequeño (192x192)
- `icon-512.png` - Icono grande (512x512)
- `icon.svg` - Icono vectorial

## 🔧 Desarrollo

Para probar la PWA en desarrollo local:

1. Inicia el servidor: `npm run dev`
2. El service worker se registrará automáticamente
3. Puedes inspeccionar el SW en DevTools → Application → Service Workers

## 📝 Manifest

El archivo `public/manifest.json` contiene la configuración de la PWA:

- **name**: Nombre completo de la app
- **short_name**: Nombre corto para pantalla de inicio
- **display**: `standalone` = pantalla completa sin navegador
- **theme_color**: Color de la barra de estado (#ff00ff - magenta)
- **background_color**: Color de fondo mientras carga (#0a0a0a - negro)

## 🚀 Despliegue

El manifest y los iconos se despliegan automáticamente con cada push a GitHub Pages.
