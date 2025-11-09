# hitster

Hitster es un juego de fiesta sobre adivinar canciones

La aplicación usa la API de Spotify para loguear al usuario (se necesita Spotify Premium)

El juego consiste en escanear QRs a URLs de spotify.
Una vez escaneada, la canción se comienza a reproducir automáticamente pero no se muestra ni el título y ni el artista ni el año.

### Notas

El menú muestra el botón "Empezar" y de ahí abre directamente la cámara para escanear el QR.

Ante una URL válida, la canción se reproduce automáticamente pero no se muestra ninguna información sobre la canción.

Existe un Botón "desvelar" que se muestra junto al icono del vinilo girando. La canción se puede parar o continuar.

Al desvelar se muestra el Título, Artista y año. 

### Notas

Si la url está entre las canciones de songs.csv, se debe mostrar el año del csv, no el que muestra Spotify.