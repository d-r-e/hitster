#!/usr/bin/env python3
"""Genera un PDF con tarjetas QR (3x5) y su reverso simétrico.
Salida: qrcards.pdf en el workspace.
"""
import sys
import subprocess
import os
from pathlib import Path

# Intentar importar dependencias y si faltan, instalarlas
try:
    import qrcode
    from weasyprint import HTML, CSS
    import pandas as pd
except Exception:
    print("Instalando dependencias necesarias...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "weasyprint", "qrcode", "pandas", "pillow"]) 
    import qrcode
    from weasyprint import HTML, CSS
    import pandas as pd

import base64
from io import BytesIO
import html

WORKDIR = Path(__file__).resolve().parents[1]
CSV_PATH = WORKDIR / 'songs.csv'
OUT_PDF = WORKDIR / 'qrcards.pdf'
OUT_FRONT_PDF = WORKDIR / 'qrcards_front.pdf'
OUT_BACK_PDF = WORKDIR / 'qrcards_back.pdf'

# Leer CSV
df = pd.read_csv(CSV_PATH)

# Normalizar columnas esperadas
# Aseguramos nombres en español: 'Artista','Título','Año','URL'
if 'Artista' not in df.columns or 'Título' not in df.columns or 'Año' not in df.columns or 'URL' not in df.columns:
    raise SystemExit('CSV debe contener columnas: Artista, Título, Año, URL')

# Convertir filas a lista de dicts
songs = []
for idx, (_, r) in enumerate(df.iterrows(), start=1):
    songs.append({
        'idx': idx,
        'artist': str(r['Artista']).strip(),
        'title': str(r['Título']).strip(),
        'year': '' if pd.isna(r['Año']) else str(int(r['Año'])) if str(r['Año']).strip().isdigit() else str(r['Año']).strip(),
        'url': str(r['URL']).strip()
    })

# Función para generar data URI de QR
def qr_data_uri(url, box_size=6, border=2):
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box_size, border=border)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    return f'data:image/png;base64,{b64}'

# Generar qr_data para cada canción
for s in songs:
    s['qr'] = qr_data_uri(s['url'], box_size=8, border=1)

# Helpers para paginar en 3x5
PER_PAGE = 15
pages = [songs[i:i+PER_PAGE] for i in range(0, len(songs), PER_PAGE)]

combined_css = """
@page {
    size: 210mm 297mm;
    margin: 5mm;
}
* { box-sizing: border-box; }
html, body {
    background: #fff;
    color: #111;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    margin: 0;
    padding: 0;
}
:root {
    --card-size: 52mm;
    --gap: 4mm;
    --grid-shift: 8mm;
}
.sheet {
    width: calc(210mm - 10mm);
    height: calc(297mm - 10mm);
    margin: 0 auto;
    display: grid;
    place-items: center;
    page-break-after: always;
}
.sheet:last-of-type {
    page-break-after: auto;
}
.grid {
    width: calc(var(--card-size) * 3 + var(--gap) * 2);
    height: calc(var(--card-size) * 5 + var(--gap) * 4);
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, var(--card-size));
    grid-template-rows: repeat(5, var(--card-size));
    column-gap: var(--gap);
    row-gap: var(--gap);
    transform: translateX(var(--grid-shift));
}
.card {
    position: relative;
    width: var(--card-size);
    height: var(--card-size);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
    padding: 4mm 3mm;
    background: #fff;
    border: 0.25mm solid #000;
    border-radius: 2mm;
    overflow: hidden;
}
.card::after {
    content: '';
    position: absolute;
    inset: 1.5mm;
    border: 0.15mm dashed rgba(0, 0, 0, 0.15);
    border-radius: 1.5mm;
    pointer-events: none;
}
.card__number {
    position: absolute;
    top: 2.5mm;
    font-size: 6pt;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #333;
}
.card-front .card__number {
    left: 3mm;
}
.card-back .card__number {
    right: 3mm;
}
.card__header,
.card__footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5mm;
}
.card-front .card__header,
.card-back .card__header,
.card-front .card__footer,
.card-back .card__footer {
    min-height: 8mm;
}
.card-back .card__footer {
    flex-direction: column;
    gap: 1mm;
}
.card__content {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}
.card__badge {
    font-size: 5.5pt;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: none;
    color: #000;
}
.card__qr {
    width: 100%;
    max-width: calc(var(--card-size) - 12mm);
    max-height: calc(var(--card-size) - 12mm);
}
.card__title {
    font-size: 9pt;
    font-weight: 700;
    line-height: 1.2;
    word-break: break-word;
}
.card__year {
    font-size: 30pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #000;
    line-height: 1;
}
.card__artist {
    font-size: 8.5pt;
    font-weight: 500;
    line-height: 1.2;
    color: #111;
    word-break: break-word;
}
.card-back .card__content {
    min-height: 16mm;
}
.card-empty::after {
    border-style: dotted;
}
.card-empty .card__header,
.card-empty .card__content,
.card-empty .card__footer {
    min-height: 4mm;
}
"""

# Construir HTML
# Generaremos documentos independientes para frente y reverso
def safe_text(value: str) -> str:
    return html.escape(value, quote=True)


def render_front_card(song: dict) -> str:
    number = song['idx']
    return (
        "<figure class='card card-front'>"
        f"<span class='card__number'>{number:02d}</span>"
        "<div class='card__header'><span class='card__badge'>hitster davo edition</span></div>"
        f"<div class='card__content'><img class='card__qr' src=\"{song['qr']}\" alt='QR code {number:02d}'/></div>"
        "<div class='card__footer'></div>"
        "</figure>"
    )


def render_back_card(song: dict) -> str:
    number = song['idx']
    title = safe_text(song['title'])
    artist = safe_text(song['artist'])
    year = safe_text(song['year']) if song['year'] else ""
    return (
        "<figure class='card card-back'>"
        f"<span class='card__number'>{number:02d}</span>"
        f"<div class='card__header'><span class='card__title'>{title}</span></div>"
        f"<div class='card__content'><span class='card__year'>{year}</span></div>"
        f"<div class='card__footer'><span class='card__artist'>{artist}</span></div>"
        "</figure>"
    )


def render_empty_card(card_type: str) -> str:
    card_class = 'card card-empty card-front' if card_type == 'front' else 'card card-empty card-back'
    return (
        f"<figure class='{card_class}'>"
        "<div class='card__header'></div>"
        "<div class='card__content'></div>"
        "<div class='card__footer'></div>"
        "</figure>"
    )


def render_front_page(page):
    parts = ["<section class='sheet sheet-front'><div class='grid'>"]
    for i in range(PER_PAGE):
        if i < len(page):
            parts.append(render_front_card(page[i]))
        else:
            parts.append(render_empty_card('front'))
    parts.append("</div></section>")
    return '\n'.join(parts)


def render_back_page(page):
    page_items = list(page)
    while len(page_items) < PER_PAGE:
        page_items.append(None)

    parts = ["<section class='sheet sheet-back'><div class='grid'>"]
    for row_start in range(0, PER_PAGE, 3):
        row = page_items[row_start:row_start + 3]
        for song in reversed(row):
            if song is None:
                parts.append(render_empty_card('back'))
            else:
                parts.append(render_back_card(song))
    parts.append("</div></section>")
    return '\n'.join(parts)

# Cabecera y estilos para el documento combinado
combined_html = ["<html><head><meta charset='utf-8'><style>", combined_css, "</style></head><body>"]

print('Renderizando PDF frontal con WeasyPrint...')
front_html_parts = ["<html><head><meta charset='utf-8'><style>", combined_css, "</style></head><body>"]
for page in pages:
    front_html_parts.append(render_front_page(page))
front_html_parts.append("</body></html>")
front_html = '\n'.join(front_html_parts)
front_doc = HTML(string=front_html)
front_bytes = front_doc.write_pdf()
with OUT_FRONT_PDF.open('wb') as f:
    f.write(front_bytes)

print('Renderizando PDF posterior con WeasyPrint...')
back_html_parts = ["<html><head><meta charset='utf-8'><style>", combined_css, "</style></head><body>"]
for page in pages:
    back_html_parts.append(render_back_page(page))
back_html_parts.append("</body></html>")
back_html = '\n'.join(back_html_parts)
back_doc = HTML(string=back_html)
back_bytes = back_doc.write_pdf()
with OUT_BACK_PDF.open('wb') as f:
    f.write(back_bytes)

print(f'PDF frontal generado en: {OUT_FRONT_PDF}')
print(f'PDF posterior generado en: {OUT_BACK_PDF}')
