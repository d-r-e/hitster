# URLs de Prueba para Hitster

Estas son algunas URLs de Spotify que puedes usar para probar la aplicación Hitster. Puedes convertirlas en códigos QR usando cualquier generador de QR online o simplemente pegarlas directamente en la app.

## Canciones del CSV (años personalizados)

Estas canciones están en el archivo `songs.csv` y mostrarán el año del CSV en lugar del año de Spotify:

### 1. Dancing Queen - ABBA (1976)
```
https://open.spotify.com/intl-es/track/0GjEhVFGZW8afUYGChu3Rr
```

### 2. I Will Survive - Gloria Gaynor (1978)
```
https://open.spotify.com/intl-es/track/7rIovIsXE6kMn629b7kDig
```

### 3. Bailando - Alaska y Los Pegamoides (1982)
```
https://open.spotify.com/intl-es/track/0OteyYh6inrfcil1XGwC3r
```

### 4. Rasputin - Bonnie M (1994)
```
https://open.spotify.com/intl-es/track/5lWSa1rmuSL6OBPOnkAqoa
```

### 5. Desátame - Mónica Naranjo (1997)
```
https://open.spotify.com/intl-es/track/2a7Ufmq13NRMavrBYUN5Ex
```

### 6. Pop - La oreja de Van Gogh (2000)
```
https://open.spotify.com/intl-es/track/4FXSEdmbbeGmPIQltH27C8
```

### 7. Yo quiero bailar - Sonia y Selena (2001)
```
https://open.spotify.com/intl-es/track/4rFCPjKfgbEeNvs1Ku4nbd
```

### 8. Dile que la quiero - David Civera (2001)
```
https://open.spotify.com/intl-es/track/7j8Wo5QDosh9vMgUGEC32q
```

### 9. Crazy in love - Beyonce ft Jay-Z (2003)
```
https://open.spotify.com/intl-es/track/5IVuqXILoxVWvWEPm82Jxr
```

### 10. Woman - Doja Cat (2021)
```
https://open.spotify.com/intl-es/track/6Uj1ctrBOjOas8xZXGqKk4
```

### 11. Reliquia - Rosalía (2025)
```
https://open.spotify.com/intl-es/track/4ORvXsPK9AJmDzm36BYcdy
```

## Cómo generar códigos QR

### Opción 1: Online
1. Ve a cualquier generador de QR como:
   - [qr-code-generator.com](https://www.qr-code-generator.com/)
   - [qr.io](https://qr.io/)
   - [the-qrcode-generator.com](https://www.the-qrcode-generator.com/)
2. Pega la URL de Spotify
3. Genera y descarga el QR
4. Imprime o muestra en pantalla

### Opción 2: Con Python
```python
import qrcode

urls = [
    "https://open.spotify.com/intl-es/track/0GjEhVFGZW8afUYGChu3Rr",
    "https://open.spotify.com/intl-es/track/7rIovIsXE6kMn629b7kDig",
    # ... más URLs
]

for i, url in enumerate(urls):
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(f"qr_{i+1}.png")
```

### Opción 3: Con Node.js
```bash
npm install qrcode
```

```javascript
const QRCode = require('qrcode');

const urls = [
    "https://open.spotify.com/intl-es/track/0GjEhVFGZW8afUYGChu3Rr",
    "https://open.spotify.com/intl-es/track/7rIovIsXE6kMn629b7kDig",
];

urls.forEach((url, i) => {
    QRCode.toFile(`qr_${i+1}.png`, url);
});
```

## Notas de Prueba

- Todas estas canciones requieren Spotify Premium para reproducirse
- Las canciones que están en `songs.csv` mostrarán el año del CSV
- Las canciones que no están en el CSV mostrarán el año del álbum de Spotify
- Puedes añadir más canciones al `songs.csv` siguiendo el formato existente

## Formato del CSV

Para añadir nuevas canciones al CSV con años personalizados:

```csv
"Artista","Título","Año","URL"
"Nombre Artista","Título de la Canción","2024","https://open.spotify.com/intl-es/track/TRACK_ID"
```

**Importante**: Asegúrate de incluir las comillas dobles y comas correctamente.

## Encontrar URLs de Spotify

Para obtener la URL de cualquier canción en Spotify:

1. Abre Spotify (app o web)
2. Busca la canción
3. Haz clic en los tres puntos (...) junto a la canción
4. Selecciona "Compartir" → "Copiar enlace de la canción"
5. Usa ese enlace en la aplicación

## Tips para Fiestas

- Imprime varios QR en tarjetas pequeñas
- Colócalos en vasos, tarjetas o un tablero
- Los jugadores escanean y compiten por adivinar el año
- Usa las canciones del CSV para dificultar la adivinanza del año exacto
