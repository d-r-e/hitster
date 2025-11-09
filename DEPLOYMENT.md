# Guía de Despliegue - Hitster

Esta guía te ayudará a desplegar la aplicación Hitster en diferentes plataformas.

## 📋 Requisitos Previos

1. **Cuenta de Spotify Premium**: La aplicación requiere Spotify Premium
2. **Spotify Developer Account**: Para obtener credenciales de API
3. **Servidor Web**: Para servir la aplicación

## 🔧 Configuración Inicial

### 1. Registrar Aplicación en Spotify

1. Ve a [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Inicia sesión con tu cuenta de Spotify
3. Haz clic en "Create app"
4. Completa el formulario:
   - **App name**: Hitster
   - **App description**: Juego de fiesta musical
   - **Redirect URI**: Añade tu URL (ej: `http://localhost:8000/` para desarrollo)
   - **API**: Marca Web API y Web Playback SDK
5. Acepta los términos y haz clic en "Save"
6. Copia tu **Client ID** desde el dashboard

### 2. Configurar la Aplicación

Edita el archivo `app.js` en la línea 6:

```javascript
this.clientId = 'TU_CLIENT_ID_AQUI';
```

Reemplaza `'YOUR_SPOTIFY_CLIENT_ID'` con tu Client ID.

## 🚀 Opciones de Despliegue

### Opción 1: Desarrollo Local

#### Con Python:
```bash
cd /ruta/a/hitster
python3 -m http.server 8000
```

Abre `http://localhost:8000` en tu navegador.

#### Con Node.js:
```bash
npm install -g http-server
cd /ruta/a/hitster
http-server -p 8000
```

#### Con PHP:
```bash
cd /ruta/a/hitster
php -S localhost:8000
```

### Opción 2: GitHub Pages

1. Sube los archivos a tu repositorio de GitHub
2. Ve a Settings → Pages
3. Selecciona la rama main como fuente
4. Tu app estará disponible en `https://tu-usuario.github.io/hitster/`
5. **Importante**: Añade esta URL a las Redirect URIs en Spotify Dashboard

### Opción 3: Netlify

1. Crea una cuenta en [Netlify](https://www.netlify.com/)
2. Arrastra y suelta la carpeta del proyecto
3. Tu app se desplegará automáticamente
4. **Importante**: Añade la URL de Netlify a las Redirect URIs en Spotify Dashboard

### Opción 4: Vercel

1. Instala Vercel CLI: `npm install -g vercel`
2. Ejecuta: `vercel` en la carpeta del proyecto
3. Sigue las instrucciones
4. **Importante**: Añade la URL de Vercel a las Redirect URIs en Spotify Dashboard

### Opción 5: Servidor Web Propio

1. Sube los archivos a tu servidor web (Apache, Nginx, etc.)
2. Asegúrate de que la carpeta es accesible vía web
3. Configura HTTPS para mejor seguridad
4. Añade tu dominio a las Redirect URIs en Spotify Dashboard

## 📱 Configuración para Móvil

### Desarrollo en Red Local

Para probar en tu móvil mientras desarrollas:

1. Encuentra tu IP local:
   - **Windows**: `ipconfig`
   - **Mac/Linux**: `ifconfig` o `ip addr`

2. Inicia el servidor: `python3 -m http.server 8000`

3. En Spotify Dashboard, añade: `http://TU_IP:8000/` a Redirect URIs

4. En tu móvil, abre: `http://TU_IP:8000/`

### Producción

Para producción, es **altamente recomendable** usar HTTPS:

1. Obtén un certificado SSL (Let's Encrypt es gratis)
2. Configura tu servidor web para usar HTTPS
3. Usa una URL `https://` en las Redirect URIs

## 🔒 Seguridad

### Notas Importantes:

- **Client ID**: Es seguro exponer el Client ID en el código del frontend
- **Client Secret**: NUNCA incluyas el Client Secret en el código del frontend
- **HTTPS**: Usa siempre HTTPS en producción
- **Redirect URIs**: Solo añade URLs que controles

### Para Mayor Seguridad:

Si quieres ocultar el Client ID, considera:

1. Crear un backend simple que maneje la autenticación
2. Usar variables de entorno en el servidor
3. Implementar un proxy para las llamadas a la API

## 🧪 Verificación

Después del despliegue, verifica:

1. ✅ La página se carga correctamente
2. ✅ El botón "Conectar con Spotify" aparece
3. ✅ Al hacer clic, redirige a Spotify
4. ✅ Después de autenticar, vuelve a la app
5. ✅ El botón "Empezar" aparece
6. ✅ La cámara se abre al hacer clic en "Empezar"

## 🐛 Solución de Problemas

### Error: "Invalid Redirect URI"
- Verifica que la URL en Redirect URIs coincida exactamente con la URL actual
- Incluye el protocolo (http:// o https://)
- No olvides la barra final si es necesaria

### Error: "Premium Required"
- Necesitas una cuenta Spotify Premium activa
- Verifica que estás usando la cuenta correcta

### La cámara no funciona
- Permite el acceso a la cámara en el navegador
- En iOS, solo funciona con HTTPS (excepto localhost)
- Verifica que el navegador tiene permisos de cámara

### La música no se reproduce
- Verifica que tienes Spotify Premium
- Asegúrate de que no hay otra sesión de Spotify activa
- Cierra otras pestañas/apps de Spotify

## 📊 Métricas y Monitoreo

Para producción, considera añadir:

- Google Analytics o similar
- Monitoreo de errores (Sentry)
- Logs de servidor
- Métricas de uso

## 🔄 Actualizaciones

Para actualizar la aplicación:

1. Haz los cambios en los archivos
2. Sube los archivos actualizados
3. Limpia la caché del navegador
4. Verifica que todo funciona correctamente

## 📞 Soporte

Si encuentras problemas:

1. Revisa la consola del navegador (F12)
2. Verifica la configuración de Spotify Developer
3. Comprueba los permisos de cámara
4. Revisa que la URL coincida con Redirect URIs

## 🎉 ¡Listo!

Una vez configurado, tu aplicación Hitster estará lista para usar en fiestas y reuniones.
