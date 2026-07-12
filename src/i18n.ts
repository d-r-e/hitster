import { useCallback, useState } from 'react';

export type Locale = 'en-US' | 'es-ES';
type Variables = Record<string, string | number>;

const messages = {
  'en-US': {
    tagline: 'Build your music timeline.', nickname: 'Your nickname', nicknamePlaceholder: 'e.g. David', createRoom: 'Create a room', orJoin: 'or join friends', roomCode: 'Room code', joinRoom: 'Join room', privateRoom: 'Private room', leave: 'Leave', shareRoom: 'Share room', roomCopied: 'Room link copied.', actionPending: 'Please wait for the current action to finish.',
    lobby: 'Lobby', lobbyHelp: 'Share the room code with everyone around the same speaker. The DJ plays too and keeps their own board.', players: '{count}/8 players', waitingDj: 'Waiting for the DJ to start…', dj: 'DJ', addLocalPlayer: 'Add player on this device', localPlayerName: 'Player name',
    spotifyDj: 'Spotify DJ', spotifyReady: 'Ready to play', spotifyConnecting: 'Connecting player…', spotifyPremium: 'Connect a Premium account', spotifyMissing: 'Missing VITE_SPOTIFY_CLIENT_ID', connectSpotify: 'Connect Spotify', reconnectSpotify: 'Reconnect Spotify', clearSpotify: 'Clear Spotify session', startGame: 'Start game',
    roundTurn: 'Round {round} · {name}\'s turn', starts: '{name} starts.', listen: 'Listen closely.', yourPlacement: 'Place the song on your board.', playerPlacement: '{name} is choosing a position.', correct: '{name} earns a disc!', wrong: '{name} missed. The song was corrected on their board.', stolen: '{name} steals the song and earns a disc!', guaranteed: '{name} buys a guaranteed song!', winner: '🏆 {name} wins!', interrupted: 'Game interrupted', waitingSong: 'Waiting for the next song', waitingTitleReview: 'The DJ is checking the title and artist guess.',
    answer: 'The answer', nowPlaying: 'Now playing', placeSong: 'Place this song', listenClosely: 'Listen closely', boardOf: '{name}\'s chart', yourBoard: 'Your chart', placePosition: 'Place song at position {position}', dragTrack: 'Drag this mystery record into the chart', watchingDrag: '{name} is placing the mystery record', confirmPosition: 'Confirm year', confirmYearTitleArtist: 'Confirm year + title & artist', changePosition: 'Not sure? Move the record again before confirming.', pointWon: 'Point won', noPoint: 'No point',
    playNext: 'Play next song', pause: 'Pause', resume: 'Resume', restart: 'Restart', replaceSong: 'Song unavailable? Replace it', titleArtistClaim: 'I named the title + artist', titleClaimHelp: 'Say both aloud before confirming to earn a token.', skipSong: 'Skip song · 1 token', challenge: 'HITSTER! · 1 token', challengeHelp: 'Now tap a different glass slot.', buyCard: 'Guaranteed song · 3 tokens', validateGuess: 'Did they correctly name title and artist?', guessCorrect: 'Yes, award token', guessWrong: 'No token',
    openingSpotify: 'Opening Spotify authorization…', spotifyConnected: 'Spotify connected. Preparing the DJ player…', spotifyLoginFailed: 'Spotify login failed.', connectingGame: 'Connecting to the game…', actionFailed: 'That action could not be completed.', serverNoSong: 'The server did not select a song.', songPlaying: 'Song playing. The active player can place it now.', playbackFailed: 'Could not start Spotify playback.', restarted: 'Song restarted.', restartFailed: 'Could not restart playback.', replacementPlaying: 'Replacement song playing.', replacementFailed: 'Could not replace the song.', createFailed: 'Could not create room.', joinFailed: 'Could not join room.', reconnecting: 'Reconnecting to the room…',
  },
  'es-ES': {
    tagline: 'Construye tu línea musical.', nickname: 'Tu nombre', nicknamePlaceholder: 'p. ej. David', createRoom: 'Crear sala', orJoin: 'o únete a tus amigos', roomCode: 'Código de sala', joinRoom: 'Entrar en la sala', privateRoom: 'Sala privada', leave: 'Salir', shareRoom: 'Compartir sala', roomCopied: 'Enlace de la sala copiado.', actionPending: 'Espera a que termine la acción actual.',
    lobby: 'Sala de espera', lobbyHelp: 'Comparte el código con todos los que estén junto al mismo altavoz. El DJ también juega y conserva su propio tablero.', players: '{count}/8 jugadores', waitingDj: 'Esperando a que el DJ empiece…', dj: 'DJ', addLocalPlayer: 'Añadir jugador en este dispositivo', localPlayerName: 'Nombre del jugador',
    spotifyDj: 'DJ de Spotify', spotifyReady: 'Listo para reproducir', spotifyConnecting: 'Conectando reproductor…', spotifyPremium: 'Conecta una cuenta Premium', spotifyMissing: 'Falta VITE_SPOTIFY_CLIENT_ID', connectSpotify: 'Conectar Spotify', reconnectSpotify: 'Reconectar Spotify', clearSpotify: 'Borrar sesión de Spotify', startGame: 'Empezar partida',
    roundTurn: 'Ronda {round} · turno de {name}', starts: 'Empieza {name}.', listen: 'Escucha con atención.', yourPlacement: 'Coloca la canción en tu tablero.', playerPlacement: '{name} está eligiendo una posición.', correct: '¡{name} gana un disco!', wrong: '{name} ha fallado. La canción se corrigió en su tablero.', stolen: '¡{name} roba la canción y gana un disco!', guaranteed: '¡{name} compra una canción garantizada!', winner: '🏆 ¡Gana {name}!', interrupted: 'Partida interrumpida', waitingSong: 'Esperando la siguiente canción', waitingTitleReview: 'El DJ está validando el título y el artista.',
    answer: 'La respuesta', nowPlaying: 'Sonando ahora', placeSong: 'Coloca esta canción', listenClosely: 'Escucha con atención', boardOf: 'Lista de {name}', yourBoard: 'Tu lista', placePosition: 'Colocar canción en la posición {position}', dragTrack: 'Arrastra este vinilo misterioso dentro de la lista', watchingDrag: '{name} está colocando el vinilo misterioso', confirmPosition: 'Confirmar año', confirmYearTitleArtist: 'Confirmar año + título y artista', changePosition: '¿No lo tienes claro? Mueve el vinilo antes de confirmar.', pointWon: 'Punto ganado', noPoint: 'Sin punto',
    playNext: 'Reproducir siguiente', pause: 'Pausar', resume: 'Continuar', restart: 'Reiniciar', replaceSong: '¿Canción no disponible? Sustituir', titleArtistClaim: 'He dicho título + artista', titleClaimHelp: 'Di ambos en voz alta antes de confirmar para ganar una ficha.', skipSong: 'Saltar canción · 1 ficha', challenge: '¡HITSTER! · 1 ficha', challengeHelp: 'Ahora toca otro hueco de cristal.', buyCard: 'Canción garantizada · 3 fichas', validateGuess: '¿Ha dicho correctamente título y artista?', guessCorrect: 'Sí, dar ficha', guessWrong: 'Sin ficha',
    openingSpotify: 'Abriendo autorización de Spotify…', spotifyConnected: 'Spotify conectado. Preparando el reproductor…', spotifyLoginFailed: 'Error al iniciar sesión en Spotify.', connectingGame: 'Conectando con la partida…', actionFailed: 'No se pudo completar la acción.', serverNoSong: 'El servidor no seleccionó ninguna canción.', songPlaying: 'Canción reproduciéndose. El jugador activo ya puede colocarla.', playbackFailed: 'No se pudo iniciar Spotify.', restarted: 'Canción reiniciada.', restartFailed: 'No se pudo reiniciar la canción.', replacementPlaying: 'Canción sustituta reproduciéndose.', replacementFailed: 'No se pudo sustituir la canción.', createFailed: 'No se pudo crear la sala.', joinFailed: 'No se pudo entrar en la sala.', reconnecting: 'Reconectando con la sala…',
  },
} as const;

export type MessageKey = keyof typeof messages['en-US'];

function initialLocale(): Locale {
  const stored = localStorage.getItem('hitster-locale');
  if (stored === 'en-US' || stored === 'es-ES') return stored;
  return navigator.language.toLowerCase().startsWith('es') ? 'es-ES' : 'en-US';
}

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = (next: Locale) => { localStorage.setItem('hitster-locale', next); setLocaleState(next); };
  const t = useCallback((key: MessageKey, variables: Variables = {}) => Object.entries(variables).reduce<string>((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[locale][key]), [locale]);
  return { locale, setLocale, t };
}
