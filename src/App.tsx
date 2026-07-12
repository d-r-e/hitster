import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameState } from '../shared/game';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { type Locale, type MessageKey, useI18n } from './i18n';
import { addLocalPlayer, createRoom, joinRoom, rejoinRoom } from './lib/api';
import { clearSession, loadSession, saveLocalPlayerIds, saveSession, type Session } from './lib/session';
import { disconnectSpotify, finishSpotifyCallback, redirectToSpotify, spotifyConfigured } from './lib/spotify';
import './App.css';

type Ack = { ok: boolean; error?: string; songUri?: string; finished?: boolean };
type T = (key: MessageKey, variables?: Record<string, string | number>) => string;
const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [session, setSession] = useState<Session | null>(loadSession());
  const [state, setState] = useState<GameState | null>(null);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState(new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [notice, setNotice] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentDjUri, setCurrentDjUri] = useState<string | null>(null);
  const actionPending = useRef(false);
  const sessionRoomCode = session?.roomCode, sessionPlayerId = session?.playerId, sessionPlayerToken = session?.playerToken;
  const controlledPlayerIds = [sessionPlayerId, ...(session?.localPlayerIds ?? [])].filter((id): id is string => Boolean(id));
  const me = state?.players.find(player => player.id === sessionPlayerId);
  const isHost = me?.isHost ?? false;
  const spotify = useSpotifyPlayer(isHost);
  const toggleSpotify = spotify.toggle;
  const playSpotify = spotify.play;

  useEffect(() => { finishSpotifyCallback().then(done => done && setNotice(tRef.current('spotifyConnected'))).catch(() => setNotice(tRef.current('spotifyLoginFailed'))); }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    if (!sessionRoomCode || !sessionPlayerId || !sessionPlayerToken) return;
    rejoinRoom(sessionRoomCode, sessionPlayerId, sessionPlayerToken).then(result => setState(result.state)).catch(() => { clearSession(); setSession(null); });
  }, [sessionRoomCode, sessionPlayerId, sessionPlayerToken]);
  useEffect(() => {
    if (!sessionRoomCode || !sessionPlayerId || !sessionPlayerToken) return;
    const connection = io(apiUrl, { auth: { roomCode: sessionRoomCode, playerId: sessionPlayerId, playerToken: sessionPlayerToken }, transports: ['websocket', 'polling'] });
    connection.on('room_state', setState); connection.on('connect_error', () => setNotice(tRef.current('reconnecting'))); connection.on('connect', () => setNotice(''));
    setSocket(connection); return () => { connection.disconnect(); setSocket(null); };
  }, [sessionRoomCode, sessionPlayerId, sessionPlayerToken]);
  useEffect(() => {
    if (!socket || !isHost || spotify.status !== 'ready' || state?.phase !== 'placing' || currentDjUri) return;
    socket.emit('get_current_dj_song', (ack: Ack) => { if (ack.ok && ack.songUri) setCurrentDjUri(ack.songUri); });
  }, [socket, isHost, spotify.status, state?.phase, currentDjUri]);
  useEffect(() => {
    if (!socket || !isHost || spotify.status !== 'ready') return;
    const playChangedSong = (uri?: string) => { if (!uri) return; setCurrentDjUri(uri); playSpotify(uri).then(() => setNotice(tRef.current('songPlaying'))).catch(error => setNotice(error instanceof Error ? error.message : tRef.current('playbackFailed'))); };
    socket.on('dj_song_changed', playChangedSong);
    return () => { socket.off('dj_song_changed', playChangedSong); };
  }, [socket, isHost, spotify.status, playSpotify]);
  useEffect(() => {
    if (!isHost || (state?.phase !== 'adjudicating' && state?.phase !== 'revealed' && state?.phase !== 'finished') || !spotify.isPlaying) return;
    toggleSpotify().catch(() => undefined);
  }, [isHost, state?.phase, spotify.isPlaying, toggleSpotify]);

  const emit = (event: string, ...args: unknown[]) => new Promise<Ack>(resolve => {
    if (!socket?.connected) return resolve({ ok: false, error: t('connectingGame') });
    socket.timeout(8_000).emit(event, ...args, (error: Error | null, ack?: Ack) => resolve(error ? { ok: false, error: t('connectingGame') } : ack ?? { ok: false, error: t('actionFailed') }));
  });
  const action = async (event: string, ...args: unknown[]): Promise<Ack> => {
    if (actionPending.current) { const ack = { ok: false, error: t('actionPending') }; setNotice(ack.error); return ack; }
    actionPending.current = true;
    const playerAction = ['select_position', 'set_title_claim', 'skip_song', 'confirm_position', 'buy_guaranteed_card'].includes(event);
    const upcomingIndex = state?.phase === 'ready' ? state.players.findIndex(player => player.id === state.activePlayerId) : state?.phase === 'revealed' ? (state.players.findIndex(player => player.id === state.activePlayerId) + 1) % (state?.players.length || 1) : -1;
    const actorId = event === 'buy_guaranteed_card' ? state?.players[upcomingIndex]?.id : state?.activePlayerId;
    try { const ack = await emit(event, ...args, ...(playerAction && actorId ? [actorId] : [])); if (!ack.ok) setNotice(ack.error ?? t('actionFailed')); return ack; } finally { actionPending.current = false; }
  };
  const startRound = async () => { try { await spotify.activate(); const ack = await action('start_round'); if (!ack.ok) throw new Error(ack.error ?? t('serverNoSong')); if (ack.finished) return; if (!ack.songUri) throw new Error(t('serverNoSong')); setCurrentDjUri(ack.songUri); await spotify.play(ack.songUri); setNotice(t('songPlaying')); } catch (error) { setNotice(error instanceof Error ? error.message : t('playbackFailed')); } };
  const retryPlayback = async () => { if (!currentDjUri) return; try { await spotify.play(currentDjUri); setNotice(t('restarted')); } catch { setNotice(t('restartFailed')); } };
  const replaceSong = async () => { try { const ack = await emit('replace_round_song'); if (!ack.ok || !ack.songUri) throw new Error(ack.error); setCurrentDjUri(ack.songUri); await spotify.play(ack.songUri); setNotice(t('replacementPlaying')); } catch { setNotice(t('replacementFailed')); } };
  const create = async () => { try { const result = await createRoom(nickname); saveSession(result); setSession({ roomCode: result.state.roomCode, playerId: result.playerId, playerToken: result.playerToken }); setState(result.state); history.replaceState({}, '', `?room=${result.state.roomCode}`); } catch { setNotice(t('createFailed')); } };
  const join = async () => { try { const result = await joinRoom(roomCode, nickname); saveSession(result); setSession({ roomCode: result.state.roomCode, playerId: result.playerId, playerToken: result.playerToken }); setState(result.state); history.replaceState({}, '', `?room=${result.state.roomCode}`); } catch { setNotice(t('joinFailed')); } };
  const connectSpotify = async () => { setNotice(t('openingSpotify')); try { await redirectToSpotify(); } catch (error) { setNotice(error instanceof Error ? error.message : t('spotifyLoginFailed')); } };
  const leave = () => { clearSession(); setSession(null); setState(null); setCurrentDjUri(null); history.replaceState({}, '', location.pathname); };
  const shareRoom = async () => {
    const url = new URL(window.location.href); url.search = `room=${state?.roomCode ?? ''}`;
    try { if (navigator.share) await navigator.share({ title: 'HITSTER', url: url.toString() }); else { await navigator.clipboard.writeText(url.toString()); setNotice(t('roomCopied')); } }
    catch (error) { if ((error as DOMException).name !== 'AbortError') setNotice(t('actionFailed')); }
  };
  const addPlayerOnDevice = async (localNickname: string) => {
    if (!session || !state) return;
    try {
      const result = await addLocalPlayer(session.roomCode, session.playerId, session.playerToken, localNickname);
      const localPlayerIds = [...(session.localPlayerIds ?? []), result.playerId];
      const nextSession = { ...session, localPlayerIds };
      saveLocalPlayerIds(nextSession, localPlayerIds); setSession(nextSession); setState(result.state);
    } catch (error) { setNotice(error instanceof Error ? error.message : t('actionFailed')); }
  };

  if (!session || !state) return <Landing {...{ nickname, setNickname, roomCode, setRoomCode, create, join, notice, locale, setLocale, t }} />;
  return <Game state={state} playerId={session.playerId} controlledPlayerIds={controlledPlayerIds} isHost={isHost} notice={notice || spotify.error} spotify={spotify} startRound={startRound} retryPlayback={retryPlayback} replaceSong={replaceSong} action={action} addPlayerOnDevice={addPlayerOnDevice} connectSpotify={connectSpotify} disconnectSpotify={() => { disconnectSpotify(); location.reload(); }} leave={leave} shareRoom={shareRoom} locale={locale} setLocale={setLocale} t={t} />;
}

function LanguageToggle({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  return <div className="language-toggle" aria-label="Language"><button className={locale === 'es-ES' ? 'selected' : ''} onClick={() => setLocale('es-ES')}>ES</button><button className={locale === 'en-US' ? 'selected' : ''} onClick={() => setLocale('en-US')}>EN</button></div>;
}

function Landing({ nickname, setNickname, roomCode, setRoomCode, create, join, notice, locale, setLocale, t }: { nickname: string; setNickname: (value: string) => void; roomCode: string; setRoomCode: (value: string) => void; create: () => void; join: () => void; notice: string; locale: Locale; setLocale: (locale: Locale) => void; t: T }) {
  return <main className="landing"><LanguageToggle {...{ locale, setLocale }} /><div className="brand"><span>♫</span><h1>HITSTER</h1><p>{t('tagline')}</p></div><section className="panel"><label>{t('nickname')}<input value={nickname} maxLength={24} onChange={event => setNickname(event.target.value)} placeholder={t('nicknamePlaceholder')} /></label><button className="primary" onClick={create}>{t('createRoom')}</button><div className="divider">{t('orJoin')}</div><label>{t('roomCode')}<input value={roomCode} maxLength={6} onChange={event => setRoomCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label><button disabled={!roomCode} onClick={join}>{t('joinRoom')}</button>{notice && <p className="notice">{notice}</p>}</section></main>;
}

function Game({ state, playerId, controlledPlayerIds, isHost, notice, spotify, startRound, retryPlayback, replaceSong, action, addPlayerOnDevice, connectSpotify, disconnectSpotify: disconnect, leave, shareRoom, locale, setLocale, t }: { state: GameState; playerId: string; controlledPlayerIds: string[]; isHost: boolean; notice: string; spotify: ReturnType<typeof useSpotifyPlayer>; startRound: () => void; retryPlayback: () => void; replaceSong: () => void; action: (event: string, ...args: unknown[]) => Promise<Ack>; addPlayerOnDevice: (nickname: string) => Promise<void>; connectSpotify: () => Promise<void>; disconnectSpotify: () => void; leave: () => void; shareRoom: () => Promise<void>; locale: Locale; setLocale: (locale: Locale) => void; t: T }) {
  const [challengeMode, setChallengeMode] = useState(false);
  const active = state.players.find(player => player.id === state.activePlayerId);
  const me = state.players.find(player => player.id === state.activePlayerId && controlledPlayerIds.includes(player.id)) ?? state.players.find(player => player.id === playerId);
  const resultOwner = state.players.find(player => player.id === state.lastResult?.cardOwnerId);
  const boardOwner = (state.phase === 'revealed' || state.phase === 'adjudicating' || state.phase === 'finished') ? resultOwner ?? active : active ?? me;
  const canPlace = state.phase === 'placing' && Boolean(active && controlledPlayerIds.includes(active.id));
  const myChallenge = state.challenges?.find(challenge => challenge.playerId === playerId);
  const canChallenge = state.phase === 'placing' && !controlledPlayerIds.includes(active?.id ?? '') && Boolean(me?.tokens) && state.selectedPosition !== undefined && !myChallenge;
  const upcomingIndex = state.phase === 'ready' ? state.players.findIndex(player => player.id === state.activePlayerId) : state.phase === 'revealed' ? (state.players.findIndex(player => player.id === state.activePlayerId) + 1) % state.players.length : -1;
  const canBuy = upcomingIndex >= 0 && controlledPlayerIds.includes(state.players[upcomingIndex]?.id ?? '') && (state.players[upcomingIndex]?.tokens ?? 0) >= 3;
  const challengeAt = async (position: number) => { const result = await action('challenge_position', position); if (result.ok) setChallengeMode(false); };
  const confirmWithTitle = async () => { const claimed = await action('set_title_claim', true); if (claimed.ok) await action('confirm_position'); };
  return <main className="game"><header><div><small>{t('privateRoom')}</small><strong>{state.roomCode}</strong></div><button className="text share-room" onClick={shareRoom}>{t('shareRoom')}</button><LanguageToggle {...{ locale, setLocale }} /><button className="text" onClick={leave}>{t('leave')}</button></header>
    {state.phase !== 'lobby' && <Scoreboard players={state.players} playerIds={controlledPlayerIds} activePlayerId={state.activePlayerId} />}
    <section className="status"><p>{statusText(state, controlledPlayerIds, t)}</p><span>{state.phase === 'lobby' ? t('players', { count: state.players.length }) : t('roundTurn', { round: state.round, name: active?.nickname ?? '' })}</span></section>
    {state.phase === 'lobby' ? <Lobby players={state.players} isHost={isHost} spotify={spotify} addPlayerOnDevice={addPlayerOnDevice} connectSpotify={connectSpotify} disconnectSpotify={disconnect} start={() => action('start_game')} t={t} /> : <><SongPanel state={state} t={t} />{state.phase === 'placing' && <TokenActions state={state} me={me} canPlace={canPlace} canChallenge={canChallenge} challengeMode={challengeMode} setChallengeMode={setChallengeMode} action={action} t={t} />}{boardOwner && <Timeline player={boardOwner} isOwn={controlledPlayerIds.includes(boardOwner.id)} canPlace={canPlace} challengeMode={challengeMode} challenges={state.phase === 'placing' ? state.challenges ?? [] : []} showMystery={state.phase === 'placing'} selectedPosition={state.selectedPosition} highlightedSongId={state.currentSong?.id} result={state.lastResult} place={position => action('select_position', position)} challenge={challengeAt} confirm={() => action('confirm_position')} confirmWithTitle={confirmWithTitle} t={t} />}{canBuy && <button className="token-buy" onClick={() => action('buy_guaranteed_card')}>{t('buyCard')}</button>}{state.phase === 'adjudicating' && isHost && <TitleAdjudication action={action} t={t} />}{state.phase === 'adjudicating' && !isHost && <p className="review-wait">{t('waitingTitleReview')}</p>}{isHost && <HostControls state={state} spotify={spotify} startRound={startRound} retryPlayback={retryPlayback} replaceSong={replaceSong} connectSpotify={connectSpotify} t={t} />}</>}
    {(notice || state.phase === 'interrupted') && <p className="notice page-notice">{notice || t('interrupted')}</p>}
  </main>;
}

function Scoreboard({ players, playerIds, activePlayerId }: { players: GameState['players']; playerIds: string[]; activePlayerId: string | null }) {
  return <div className="scoreboard">{players.map(player => <div key={player.id} className={`score-chip ${playerIds.includes(player.id) ? 'mine' : ''} ${player.id === activePlayerId ? 'active' : ''}`}><span>{player.nickname}</span><strong><i className="score-disc" />{player.score}<i className="hitster-token" />{player.tokens}</strong></div>)}</div>;
}

function statusText(state: GameState, playerIds: string[], t: T) {
  const active = state.players.find(player => player.id === state.activePlayerId), winner = state.players.find(player => player.id === state.winnerId), resultPlayer = state.players.find(player => player.id === state.lastResult?.playerId);
  if (state.phase === 'finished') return t('winner', { name: winner?.nickname ?? '' });
  if (state.phase === 'interrupted') return t('interrupted');
  if (state.phase === 'ready') return t('starts', { name: active?.nickname ?? '' });
  if (state.phase === 'listening') return t('listen');
  if (state.phase === 'placing') return active && playerIds.includes(active.id) ? t('yourPlacement') : t('playerPlacement', { name: active?.nickname ?? '' });
  if (state.phase === 'adjudicating') return t('waitingTitleReview');
  if (state.phase === 'revealed' && state.lastResult) {
    const owner = state.players.find(player => player.id === state.lastResult!.cardOwnerId);
    if (state.lastResult.guaranteed) return t('guaranteed', { name: owner?.nickname ?? '' });
    if (owner?.id !== state.lastResult.playerId) return t('stolen', { name: owner?.nickname ?? '' });
    return t(state.lastResult.correct ? 'correct' : 'wrong', { name: resultPlayer?.nickname ?? '' });
  }
  return t('waitingSong');
}

function Lobby({ players, isHost, spotify, addPlayerOnDevice, connectSpotify, disconnectSpotify: disconnect, start, t }: { players: GameState['players']; isHost: boolean; spotify: ReturnType<typeof useSpotifyPlayer>; addPlayerOnDevice: (nickname: string) => Promise<void>; connectSpotify: () => Promise<void>; disconnectSpotify: () => void; start: () => void; t: T }) {
  const [localNickname, setLocalNickname] = useState('');
  const spotifyStatus = spotify.status === 'ready' ? t('spotifyReady') : spotify.status === 'connecting' ? t('spotifyConnecting') : spotify.status === 'error' ? spotify.error : spotifyConfigured() ? t('spotifyPremium') : t('spotifyMissing');
  const add = async () => { await addPlayerOnDevice(localNickname); setLocalNickname(''); };
  return <section className="panel lobby"><div className="box-label">HITSTER PARTY</div><h2>{t('lobby')}</h2><p>{t('lobbyHelp')}</p><div className="player-rack">{players.map((player, index) => <div className="player-piece" key={player.id}><i className={`player-disc disc-${index % 4}`} /><span>{player.nickname}</span>{player.isHost && <small>{t('dj')}</small>}<b className={player.connected ? 'online' : 'offline'} /></div>)}</div><div className="local-player-add"><label>{t('localPlayerName')}<input value={localNickname} maxLength={24} onChange={event => setLocalNickname(event.target.value)} /></label><button disabled={!localNickname.trim() || players.length >= 8} onClick={add}>{t('addLocalPlayer')}</button></div>{isHost && <div className={`spotify-status ${spotify.status}`}><span className="spotify-dot" /><div><strong>{t('spotifyDj')}</strong><small>{spotifyStatus}</small></div></div>}{isHost && spotify.status !== 'ready' && spotifyConfigured() && <button className="spotify-button" onClick={connectSpotify}>{spotify.status === 'disconnected' ? t('connectSpotify') : t('reconnectSpotify')}</button>}{isHost && spotify.status !== 'ready' && <button className="text" onClick={disconnect}>{t('clearSpotify')}</button>}{isHost ? <button className="primary" disabled={spotify.status !== 'ready'} onClick={start}>{t('startGame')}</button> : <p className="waiting">{t('waitingDj')}</p>}</section>;
}

function SongPanel({ state, t }: { state: GameState; t: T }) { const song = state.currentSong; return <section className={`song ${song ? 'revealed' : ''}`}><div className={`record ${state.phase === 'placing' ? 'spinning' : ''}`}><i className="record-label">HITSTER</i></div>{song ? <div><small>{t('answer')}</small><h2>{song.title}</h2><p>{song.artist} · {song.year}</p></div> : <div><small>{t('nowPlaying')}</small><h2>{t(state.phase === 'placing' ? 'placeSong' : 'listenClosely')}</h2></div>}</section>; }

function TokenActions({ state, me, canPlace, canChallenge, challengeMode, setChallengeMode, action, t }: { state: GameState; me?: GameState['players'][number]; canPlace: boolean; canChallenge: boolean; challengeMode: boolean; setChallengeMode: (value: boolean) => void; action: (event: string, ...args: unknown[]) => Promise<Ack>; t: T }) {
  if (!me) return null;
  const canSkip = canPlace && me.tokens > 0 && state.selectedPosition === undefined && !state.titleClaimed && !state.challenges?.length;
  return <div className="token-actions">{canSkip && <button onClick={() => action('skip_song')}>{t('skipSong')}</button>}{canChallenge && <button className={`hitster-call ${challengeMode ? 'pressed' : ''}`} onClick={() => setChallengeMode(!challengeMode)}>{t('challenge')}</button>}{challengeMode && <small className="challenge-help">{t('challengeHelp')}</small>}</div>;
}

function TitleAdjudication({ action, t }: { action: (event: string, ...args: unknown[]) => Promise<Ack>; t: T }) {
  return <section className="title-review"><i className="hitster-token large" /><strong>{t('validateGuess')}</strong><div><button className="primary" onClick={() => action('adjudicate_title', true)}>{t('guessCorrect')}</button><button onClick={() => action('adjudicate_title', false)}>{t('guessWrong')}</button></div></section>;
}

function Timeline({ player, isOwn, canPlace, challengeMode, challenges, showMystery, selectedPosition, highlightedSongId, result, place, challenge, confirm, confirmWithTitle, t }: { player: GameState['players'][number]; isOwn: boolean; canPlace: boolean; challengeMode: boolean; challenges: NonNullable<GameState['challenges']>; showMystery: boolean; selectedPosition?: number; highlightedSongId?: string; result?: GameState['lastResult']; place: (position: number) => void; challenge: (position: number) => void; confirm: () => void; confirmWithTitle: () => void; t: T }) {
  const [dragging, setDragging] = useState(false), [hovered, setHovered] = useState<number | null>(null), [offset, setOffset] = useState(0);
  const startY = useRef(0);
  const findDrop = (clientY: number) => { const zones = [...document.querySelectorAll<HTMLElement>(`[data-board="${player.id}"] .drop-zone`)]; return zones.reduce<{ index: number; distance: number } | null>((best, zone) => { const rect = zone.getBoundingClientRect(), distance = Math.abs(clientY - (rect.top + rect.bottom) / 2), index = Number(zone.dataset.dropIndex); return !best || distance < best.distance ? { index, distance } : best; }, null)?.index ?? null; };
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => { if (!canPlace) return; event.currentTarget.setPointerCapture(event.pointerId); startY.current = event.clientY; setDragging(true); setHovered(findDrop(event.clientY)); };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => { if (!dragging) return; setOffset(event.clientY - startY.current); setHovered(findDrop(event.clientY)); };
  const pointerUp = () => { if (dragging && hovered !== null) place(hovered); setDragging(false); setHovered(null); setOffset(0); };
  const mysteryRecord = (compact: boolean) => <button className={`mystery-track ${compact ? 'in-slot' : 'at-deck'} ${canPlace ? 'draggable' : 'spectator'} ${dragging ? 'dragging' : ''}`} style={{ transform: `translate3d(0, ${offset}px, 0)` }} disabled={!canPlace} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><i className="mystery-vinyl"><em>HITSTER</em></i>{!compact && <span>{canPlace ? t('dragTrack') : t('watchingDrag', { name: player.nickname })}</span>}<b>⋮⋮</b></button>;
  const challengeMarkers = (position: number) => challenges.filter(item => item.position === position).map(item => <i className="challenge-token" key={item.playerId}>H</i>);
  const interactable = canPlace || challengeMode;
  const wonPoint = Boolean(result && (result.correct || result.guaranteed || result.cardOwnerId !== result.playerId));
  return <section className="timeline" data-board={player.id}><div className="timeline-title"><div><small>HITSTER</small><h2>{isOwn ? t('yourBoard') : t('boardOf', { name: player.nickname })}</h2></div></div>{showMystery && selectedPosition === undefined && mysteryRecord(false)}<div className={`chart-list ${challengeMode ? 'challenge-mode' : ''}`}>{Array.from({ length: player.timeline.length + 1 }, (_, index) => { const card = player.timeline[index]; const isLatest = card?.song.id === highlightedSongId; return <div className="chart-slot" key={`slot-${index}`}>{showMystery && selectedPosition === index ? <div data-drop-index={index} className={`drop-zone occupied ${hovered === index ? 'hovered' : ''}`}>{mysteryRecord(true)}<span className="challenge-stack">{challengeMarkers(index)}</span></div> : <button data-drop-index={index} className={`drop-zone ${interactable ? 'available' : ''} ${hovered === index ? 'hovered' : ''}`} disabled={!interactable} onClick={() => canPlace ? place(index) : challenge(index)} aria-label={t('placePosition', { position: index + 1 })}><span className="challenge-stack">{challengeMarkers(index)}</span></button>}{card && <article className={`chart-card ${decadeClass(card.song.year)} ${isLatest ? `latest-card ${wonPoint ? 'won' : 'missed'}` : ''}`}><div className="chart-year"><strong>{card.song.year}</strong></div><div className="chart-copy"><strong>{card.song.title}</strong><span>{card.song.artist}</span>{isLatest && <b className="result-badge">{wonPoint ? `✓ ${t('pointWon')}` : `× ${t('noPoint')}`}</b>}</div></article>}</div>; })}</div>{canPlace && selectedPosition !== undefined && <div className="confirm-tray"><span>{t('changePosition')}</span><div className="confirm-actions"><button onClick={confirm}>{t('confirmPosition')}</button><button className="primary" onClick={confirmWithTitle}>{t('confirmYearTitleArtist')}</button></div></div>}</section>;
}

function decadeClass(year: number) {
  const decade = Math.floor(year / 10) * 10;
  if (decade < 1960) return 'decade-50';
  if (decade > 2020) return 'decade-20';
  return `decade-${String(decade).slice(-2)}`;
}

function HostControls({ state, spotify, startRound, retryPlayback, replaceSong, connectSpotify, t }: { state: GameState; spotify: ReturnType<typeof useSpotifyPlayer>; startRound: () => void; retryPlayback: () => void; replaceSong: () => void; connectSpotify: () => Promise<void>; t: T }) {
  if (spotify.status !== 'ready') return <section className="host-controls compact"><button className="spotify-button" onClick={connectSpotify}>{t('reconnectSpotify')}</button></section>;
  return <section className="host-controls compact">{(state.phase === 'ready' || state.phase === 'revealed') && <button className="primary" onClick={startRound}>{t('playNext')}</button>}{state.phase === 'placing' && <div className="dj-toolbar"><button className="icon-button" onClick={spotify.toggle} aria-label={t(spotify.isPlaying ? 'pause' : 'resume')} title={t(spotify.isPlaying ? 'pause' : 'resume')}><span aria-hidden="true">{spotify.isPlaying ? 'Ⅱ' : '▶'}</span></button><button className="icon-button" onClick={retryPlayback} aria-label={t('restart')} title={t('restart')}><span aria-hidden="true">↻</span></button><button className="replace-link" onClick={replaceSong}>{t('replaceSong')}</button></div>}</section>;
}
