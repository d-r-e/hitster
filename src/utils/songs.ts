import * as Papa from 'papaparse';
import type { Song } from '../types';

let songsCache: Song[] | null = null;

export const loadSongs = async (): Promise<Song[]> => {
  if (songsCache) return songsCache;
  
  try {
    const response = await fetch('/songs.csv');
    const text = await response.text();
    
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true
    });
    
    songsCache = result.data.slice(1).map((row: string[]) => ({
      artist: row[0]?.replace(/"/g, '') || '',
      title: row[1]?.replace(/"/g, '') || '',
      year: row[2]?.replace(/"/g, '') || '',
      url: row[3]?.replace(/"/g, '') || ''
    }));
    
    return songsCache || [];
  } catch (error) {
    console.error('Error loading songs:', error);
    return [];
  }
};

export const findSongByUrl = (url: string, songs: Song[]): Song | null => {
  return songs.find(song => song.url === url) || null;
};
