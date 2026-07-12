import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Song } from '../shared/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = path.join(root, 'songs');

function csvCell(value: string) {
  return value.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
}

function trackId(url: string) {
  return url.match(/track\/([A-Za-z0-9]+)/)?.[1];
}

/** A deliberately small CSV reader: quoted commas are handled for the supplied deck. */
function row(line: string) {
  const values: string[] = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(csvCell(value)); value = ''; }
    else value += char;
  }
  values.push(csvCell(value));
  return values;
}

function parseCsv(file: string): Song[] {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = row(lines.shift()?.replace(/^\uFEFF/, '') ?? '');
  const artistIndex = header.indexOf('Artista');
  const titleIndex = header.indexOf('Título');
  const yearIndex = header.indexOf('Año');
  const urlIndex = header.indexOf('URL');
  if ([artistIndex, titleIndex, yearIndex, urlIndex].includes(-1)) return [];
  const seen = new Set<string>();
  return lines.flatMap(line => {
    const values = row(line);
    const artist = values[artistIndex];
    const title = values[titleIndex];
    const year = values[yearIndex];
    const url = values[urlIndex];
    const id = trackId(url ?? '');
    const parsedYear = Number(year);
    if (!id || !artist || !title || !Number.isInteger(parsedYear) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, artist, title, year: parsedYear, spotifyUri: `spotify:track:${id}` }];
  });
}

/** Turns a pack filename like `02_Pop_hits.csv` into a friendly label ("Pop hits"). */
function packName(file: string) {
  return path.basename(file, '.csv').replace(/^\d+_/, '').replace(/_/g, ' ');
}

export interface SongPack {
  id: string;
  name: string;
  songs: Song[];
}

export function loadPacks(): SongPack[] {
  if (!fs.existsSync(songsDir)) return [];
  return fs.readdirSync(songsDir)
    .filter(file => file.endsWith('.csv') && !file.startsWith('.'))
    .sort()
    .map(file => {
      const id = path.basename(file, '.csv');
      return { id, name: packName(file), songs: parseCsv(path.join(songsDir, file)) };
    });
}
