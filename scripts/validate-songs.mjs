import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = path.join(root, 'songs');
const fix = process.argv.includes('--fix');

function parseRow(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

const errors = [];
let checked = 0;
let normalized = 0;

for (const file of fs.readdirSync(songsDir).filter(name => name.endsWith('.csv')).sort()) {
  const fullPath = path.join(songsDir, file);
  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  const header = parseRow(lines[0].replace(/^\uFEFF/, ''));
  const artistIndex = header.indexOf('Artista');
  const titleIndex = header.indexOf('Título');
  const yearIndex = header.indexOf('Año');
  const urlIndex = header.indexOf('URL');
  if ([artistIndex, titleIndex, yearIndex, urlIndex].includes(-1)) {
    errors.push(`${file}: expected columns Artista,Título,Año,URL`);
    continue;
  }

  let changed = false;
  lines.forEach((line, index) => {
    if (index === 0 || !line.trim()) return;
    checked += 1;
    const values = parseRow(line);
    const artist = values[artistIndex];
    const title = values[titleIndex];
    const year = values[yearIndex];
    const rawUrl = values[urlIndex];
    const location = `${file}:${index + 1}`;
    if (!artist) errors.push(`${location}: missing artist`);
    if (!title) errors.push(`${location}: missing title`);
    if (!/^\d{4}$/.test(year)) errors.push(`${location}: missing or invalid year "${year}"`);
    if (!rawUrl) { errors.push(`${location}: missing URL`); return; }
    let parsed;
    try { parsed = new URL(rawUrl); } catch { errors.push(`${location}: invalid URL "${rawUrl}"`); return; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'open.spotify.com' || !/^\/(?:[^/]+\/)?track\/[A-Za-z0-9]+$/.test(parsed.pathname)) {
      errors.push(`${location}: expected an open.spotify.com/track URL`);
    }
    if (parsed.search || parsed.hash) {
      if (fix) {
        const cleanUrl = `${parsed.origin}${parsed.pathname}`;
        lines[index] = line.replace(rawUrl, cleanUrl);
        changed = true;
        normalized += 1;
      } else errors.push(`${location}: URL contains query or hash arguments`);
    }
  });
  if (changed) fs.writeFileSync(fullPath, lines.join('\n'));
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${checked} songs across ${fs.readdirSync(songsDir).filter(name => name.endsWith('.csv')).length} packs.`);
  if (fix) console.log(`Removed URL arguments from ${normalized} song URLs.`);
}
