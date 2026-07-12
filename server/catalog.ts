import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Song } from '../shared/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

export function loadCatalog(): Song[] {
  const file = path.join(root, 'songs.csv');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(1);
  const seen = new Set<string>();
  return lines.flatMap(line => {
    const [artist, title, year, url] = row(line);
    const id = trackId(url ?? '');
    const parsedYear = Number(year);
    if (!id || !artist || !title || !Number.isInteger(parsedYear) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, artist, title, year: parsedYear, spotifyUri: `spotify:track:${id}` }];
  });
}
