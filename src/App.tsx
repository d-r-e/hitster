import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameState } from '../shared/game';
import { RoomQr } from './components/RoomQr';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { type Locale, type MessageKey, useI18n } from './i18n';
import { addLocalPlayer, createRoom, joinRoom, rejoinRoom } from './lib/api';
import { clearSession, loadSession, saveLocalPlayerIds, saveSession, type Session } from './lib/session';
import { disconnectSpotify, finishSpotifyCallback, redirectToSpotify, spotifyConfigured } from './lib/spotify';
import './App.css';

type Ack = { ok: boolean; error?: string; songUri?: string; finished?: boolean };
type T = (key: MessageKey, variables?: Record<string, string | number>) => string;
const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;
const requestedRoomCode = () => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [session, setSession] = useState<Session | null>(() => {
    const savedSession = loadSession();
    const roomCodeFromUrl = requestedRoomCode();
    if (savedSession && roomCodeFromUrl && savedSession.roomCode.toUpperCase() !== roomCodeFromUrl) {
      clearSession();
      return null;
    }
    return savedSession;
  });
  const [state, setState] = useState<GameState | null>(null);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState(requestedRoomCode);
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
    const handleRoomUrlChange = () => {
      const nextRoomCode = requestedRoomCode();
      setRoomCode(nextRoomCode);
      setSession(currentSession => {
        if (!currentSession || !nextRoomCode || currentSession.roomCode.toUpperCase() === nextRoomCode) return currentSession;
        clearSession();
        setState(null);
        setCurrentDjUri(null);
        return null;
      });
    };
    window.addEventListener('popstate', handleRoomUrlChange);
    return () => window.removeEventListener('popstate', handleRoomUrlChange);
  }, []);
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
  useEffect(() => {
    const songId = state?.phase === 'adjudicating' || state?.phase === 'revealed' || state?.phase === 'finished' ? state.currentSong?.id : undefined;
    const placement = state?.lastResult?.placement;
    if (!songId || placement === undefined) return;
    const timer = window.setTimeout(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector<HTMLElement>(`[data-song-id="${songId}"]`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [state?.phase, state?.currentSong?.id, state?.lastResult?.placement, state?.lastResult?.playerId]);

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
  return <div className="language-toggle" aria-label="Language"><button className={locale === 'de-DE' ? 'selected' : ''} onClick={() => setLocale('de-DE')}>DE</button><button className={locale === 'es-ES' ? 'selected' : ''} onClick={() => setLocale('es-ES')}>ES</button><button className={locale === 'en-US' ? 'selected' : ''} onClick={() => setLocale('en-US')}>EN</button></div>;
}

function Landing({ nickname, setNickname, roomCode, setRoomCode, create, join, notice, locale, setLocale, t }: { nickname: string; setNickname: (value: string) => void; roomCode: string; setRoomCode: (value: string) => void; create: () => void; join: () => void; notice: string; locale: Locale; setLocale: (locale: Locale) => void; t: T }) {
  const viaLink = Boolean(roomCode);
  return <main className="landing"><LanguageToggle {...{ locale, setLocale }} /><div className="brand"><span>♫</span><h1>HITSTER</h1><p>{t('tagline')}</p></div><section className="panel"><label>{t('nickname')}<input value={nickname} maxLength={24} onChange={event => setNickname(event.target.value)} placeholder={t('nicknamePlaceholder')} /></label>{!viaLink && <button className="primary" onClick={create}>{t('createRoom')}</button>}{!viaLink && <div className="divider">{t('orJoin')}</div>}<label>{t('roomCode')}<input value={roomCode} maxLength={3} onChange={event => setRoomCode(event.target.value.toUpperCase())} placeholder="ABC" /></label><button disabled={!roomCode} onClick={join}>{t('joinRoom')}</button>{notice && <p className="notice">{notice}</p>}</section></main>;
}

function Game({ state, playerId, controlledPlayerIds, isHost, notice, spotify, startRound, retryPlayback, replaceSong, action, addPlayerOnDevice, connectSpotify, disconnectSpotify: disconnect, leave, shareRoom, locale, setLocale, t }: { state: GameState; playerId: string; controlledPlayerIds: string[]; isHost: boolean; notice: string; spotify: ReturnType<typeof useSpotifyPlayer>; startRound: () => void; retryPlayback: () => void; replaceSong: () => void; action: (event: string, ...args: unknown[]) => Promise<Ack>; addPlayerOnDevice: (nickname: string) => Promise<void>; connectSpotify: () => Promise<void>; disconnectSpotify: () => void; leave: () => void; shareRoom: () => Promise<void>; locale: Locale; setLocale: (locale: Locale) => void; t: T }) {
  const [challengeMode, setChallengeMode] = useState(false);
  const active = state.players.find(player => player.id === state.activePlayerId);
  const me = state.players.find(player => player.id === state.activePlayerId && controlledPlayerIds.includes(player.id)) ?? state.players.find(player => player.id === playerId);
  const resultOwner = state.players.find(player => player.id === state.lastResult?.cardOwnerId);
  const boardOwner = (state.phase === 'revealed' || state.phase === 'adjudicating' || state.phase === 'finished') ? resultOwner ?? active : active ?? me;
  const canPlace = state.phase === 'placing' && Boolean(active && controlledPlayerIds.includes(active.id));
  const canSkip = canPlace && (me?.tokens ?? 0) > 0 && state.selectedPosition === undefined && !state.titleClaimed && !state.challenges?.length;
  const myChallenge = state.challenges?.find(challenge => challenge.playerId === playerId);
  const canChallenge = state.phase === 'placing' && !controlledPlayerIds.includes(active?.id ?? '') && Boolean(me?.tokens) && state.selectedPosition !== undefined && !myChallenge;
  const upcomingIndex = state.phase === 'ready' ? state.players.findIndex(player => player.id === state.activePlayerId) : state.phase === 'revealed' ? (state.players.findIndex(player => player.id === state.activePlayerId) + 1) % state.players.length : -1;
  const canBuy = upcomingIndex >= 0 && controlledPlayerIds.includes(state.players[upcomingIndex]?.id ?? '') && (state.players[upcomingIndex]?.tokens ?? 0) >= 3;
  const challengeAt = async (position: number) => { const result = await action('challenge_position', position); if (result.ok) setChallengeMode(false); };
  const confirmWithTitle = async () => { const claimed = await action('set_title_claim', true); if (claimed.ok) await action('confirm_position'); };
    const turnName = active?.nickname ? active.nickname.charAt(0).toUpperCase() + active.nickname.slice(1) : '';
    const topBar = state.phase === 'lobby'
      ? <><small>{t('privateRoom')}</small><strong>{state.roomCode}</strong></>
      : <strong>{t('turnTitle', { name: turnName })}</strong>;
    return <main className="game"><header><div>{topBar}</div><button className="text share-room" onClick={shareRoom}>{t('shareRoom')}</button><LanguageToggle {...{ locale, setLocale }} /><button className="text" onClick={leave}>{t('leave')}</button></header>
    {state.phase !== 'lobby' && <Scoreboard players={state.players} playerIds={controlledPlayerIds} activePlayerId={state.activePlayerId} />}
    <section className="status"><p>{statusText(state, controlledPlayerIds, t)}</p><span>{state.phase === 'lobby' ? t('players', { count: state.players.length }) : t('roundTurn', { round: state.round, name: active?.nickname ?? '' })}</span></section>
    {state.phase === 'lobby' ? <Lobby players={state.players} roomCode={state.roomCode} difficulty={state.difficulty} isHost={isHost} spotify={spotify} addPlayerOnDevice={addPlayerOnDevice} connectSpotify={connectSpotify} disconnectSpotify={disconnect} start={() => action('start_game')} packs={state.availablePacks ?? []} selectedPackIds={state.selectedPackIds ?? []} songCount={state.selectedSongCount ?? 0} onTogglePacks={(ids: string[]) => action('set_packs', ids)} onDifficulty={difficulty => action('set_difficulty', difficulty)} t={t} /> : <><SongPanel state={state} t={t} isPlaying={spotify.isPlaying} onTogglePlay={spotify.toggle} onRestart={retryPlayback} canSkip={canSkip} onSkip={() => action('skip_song')} />{state.phase === 'placing' && <TokenActions me={me} canChallenge={canChallenge} challengeMode={challengeMode} setChallengeMode={setChallengeMode} t={t} />}{boardOwner && <Timeline player={boardOwner} currentSong={state.currentSong} isOwn={controlledPlayerIds.includes(boardOwner.id)} canPlace={canPlace} challengeMode={challengeMode} challenges={state.phase === 'placing' ? state.challenges ?? [] : []} showMystery={state.phase === 'placing'} selectedPosition={state.selectedPosition} highlightedSongId={state.currentSong?.id} result={state.lastResult} place={position => action('select_position', position)} challenge={challengeAt} confirm={() => action('confirm_position')} confirmWithTitle={confirmWithTitle} t={t} />}{canBuy && <button className="token-buy" onClick={() => action('buy_guaranteed_card')}>{t('buyCard')}</button>}{state.phase === 'adjudicating' && isHost && <TitleAdjudication action={action} t={t} />}{state.phase === 'adjudicating' && !isHost && <p className="review-wait">{t('waitingTitleReview')}</p>}{isHost && <HostControls state={state} spotify={spotify} startRound={startRound} replaceSong={replaceSong} connectSpotify={connectSpotify} t={t} />}</>}
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
    return t(state.lastResult.correct ? 'correct' : state.difficulty === 'difficult' ? 'wrongCorrected' : 'wrong', { name: resultPlayer?.nickname ?? '' });
  }
  return t('waitingSong');
}

function Lobby({ players, roomCode, difficulty, isHost, spotify, addPlayerOnDevice, connectSpotify, disconnectSpotify: disconnect, start, packs, selectedPackIds, songCount, onTogglePacks, onDifficulty, t }: { players: GameState['players']; roomCode: string; difficulty: GameState['difficulty']; isHost: boolean; spotify: ReturnType<typeof useSpotifyPlayer>; addPlayerOnDevice: (nickname: string) => Promise<void>; connectSpotify: () => Promise<void>; disconnectSpotify: () => void; start: () => void; packs: NonNullable<GameState['availablePacks']>; selectedPackIds: string[]; songCount: number; onTogglePacks: (ids: string[]) => Promise<Ack>; onDifficulty: (difficulty: GameState['difficulty']) => Promise<Ack>; t: T }) {
  const [localNickname, setLocalNickname] = useState('');
  const spotifyStatus = spotify.status === 'ready' ? t('spotifyReady') : spotify.status === 'connecting' ? t('spotifyConnecting') : spotify.status === 'error' ? spotify.error : spotifyConfigured() ? t('spotifyPremium') : t('spotifyMissing');
  const joinUrl = (() => { const url = new URL(window.location.href); url.search = `room=${roomCode}`; return url.toString(); })();
  const add = async () => { await addPlayerOnDevice(localNickname); setLocalNickname(''); };
  const required = players.length * 20;
  const enough = songCount >= required;
  const selected = new Set(selectedPackIds);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onTogglePacks([...next]);
  };
  return <section className="panel lobby"><div className="box-label">HITSTER PARTY</div><div className="lobby-columns"><div className="lobby-main"><h2>{t('lobby')}</h2><p>{t('lobbyHelp')}</p><div className="player-rack">{players.map((player, index) => <div className="player-piece" key={player.id}><i className={`player-disc disc-${index % 4}`} /><span>{player.nickname}</span>{player.isHost && <small>{t('dj')}</small>}<b className={player.connected ? 'online' : 'offline'} /></div>)}</div></div><div className="lobby-side"><div className="lobby-qr"><RoomQr value={joinUrl} /><span className="qr-caption">{t('scanToJoin')}</span></div></div></div>
    {isHost ? <><section className="difficulty"><h3>{t('difficulty')}</h3><div><button className={difficulty === 'easy' ? 'selected' : ''} onClick={() => onDifficulty('easy')}><strong>{t('easy')}</strong><small>{t('easyHelp')}</small></button><button className={difficulty === 'difficult' ? 'selected' : ''} onClick={() => onDifficulty('difficult')}><strong>{t('difficult')}</strong><small>{t('difficultHelp')}</small></button></div></section><SongPacks packs={packs} selected={selected} total={songCount} required={required} onToggle={toggle} t={t} /></> : <p className="packs-readonly">{t('packsSelected', { count: selectedPackIds.length, total: packs.length, songs: t('songsLabel', { count: songCount }) })}</p>}
    <div className="local-player-add"><label>{t('localPlayerName')}<input value={localNickname} maxLength={24} onChange={event => setLocalNickname(event.target.value)} /></label><button disabled={!localNickname.trim() || players.length >= 8} onClick={add}>{t('addLocalPlayer')}</button></div>{isHost && <div className={`spotify-status ${spotify.status}`}><span className="spotify-dot" /><div><strong>{t('spotifyDj')}</strong><small>{spotifyStatus}</small></div></div>}{isHost && spotify.status !== 'ready' && spotifyConfigured() && <button className="spotify-button" onClick={connectSpotify}>{spotify.status === 'disconnected' ? t('connectSpotify') : t('reconnectSpotify')}</button>}{isHost && spotify.status !== 'ready' && <button className="text" onClick={disconnect}>{t('clearSpotify')}</button>}{isHost ? <button className="primary" disabled={spotify.status !== 'ready' || !enough} onClick={start}>{t('startGame')}</button> : <p className="waiting">{t('waitingDj')}</p>}</section>;
}

function SongPacks({ packs, selected, total, required, onToggle, t }: { packs: NonNullable<GameState['availablePacks']>; selected: Set<string>; total: number; required: number; onToggle: (id: string) => void; t: T }) {
  const enough = total >= required;
  const need = Math.max(0, required - total);
  return <section className="song-packs"><div className="packs-head"><h3>{t('songPacks')}</h3><span className={`packs-total ${enough ? 'ready' : ''}`}>{t('packsSelected', { count: selected.size, total: packs.length, songs: t('songsLabel', { count: total }) })}</span></div><p className="packs-help">{t('songPacksHelp')}</p><div className="pack-list">{packs.map(pack => { const on = selected.has(pack.id); return <button key={pack.id} className={`pack-toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(pack.id)}><span className="pack-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="pack-name">{pack.name}</span><span className="pack-count">{t('songsLabel', { count: pack.count })}</span></button>; })}</div>{!enough && <p className="packs-need">{t('needSongs', { count: need })}</p>}</section>;
}

function SongPanel({ state, t, isPlaying, onTogglePlay, onRestart, canSkip, onSkip }: { state: GameState; t: T; isPlaying: boolean; onTogglePlay: () => void; onRestart: () => void; canSkip: boolean; onSkip: () => void }) { const song = state.currentSong; const [skipLabel, skipToken] = t('skipSong').split(' · '); return <section className={`song ${song ? 'revealed' : ''}`}><div className={`record ${state.phase === 'placing' ? 'spinning' : ''}`}><i className="record-label">HITSTER</i>{state.phase === 'placing' && <button className="record-button" onClick={isPlaying ? onTogglePlay : onRestart} aria-label={isPlaying ? t('pause') : t('restart')}>{isPlaying ? <img src="/pause.svg" alt="" aria-hidden="true" /> : <img src="/redo.svg" alt="" aria-hidden="true" />}</button>}</div>{song ? <div><small>{t('answer')}</small><h2>{song.title}</h2><p>{song.artist} · {song.year}</p></div> : <div><small>{t('nowPlaying')}</small><h2>{t(state.phase === 'placing' ? 'placeSong' : 'listenClosely')}</h2></div>}{canSkip && <button className="skip-song" onClick={onSkip}><span className="skip-label">{skipLabel}</span><span className="skip-token">{skipToken}</span></button>}</section>; }

function TokenActions({ me, canChallenge, challengeMode, setChallengeMode, t }: { me?: GameState['players'][number]; canChallenge: boolean; challengeMode: boolean; setChallengeMode: (value: boolean) => void; t: T }) {
  if (!me) return null;
  return <div className="token-actions">{canChallenge && <button className={`hitster-call ${challengeMode ? 'pressed' : ''}`} onClick={() => setChallengeMode(!challengeMode)}>{t('challenge')}</button>}{challengeMode && <small className="challenge-help">{t('challengeHelp')}</small>}</div>;
}

function TitleAdjudication({ action, t }: { action: (event: string, ...args: unknown[]) => Promise<Ack>; t: T }) {
  return <section className="title-review"><i className="hitster-token large" /><strong>{t('validateGuess')}</strong><div><button className="primary" onClick={() => action('adjudicate_title', true)}>{t('guessCorrect')}</button><button onClick={() => action('adjudicate_title', false)}>{t('guessWrong')}</button></div></section>;
}

function Timeline({ player, currentSong, isOwn, canPlace, challengeMode, challenges, showMystery, selectedPosition, highlightedSongId, result, place, challenge, confirm, confirmWithTitle, t }: { player: GameState['players'][number]; currentSong?: GameState['currentSong']; isOwn: boolean; canPlace: boolean; challengeMode: boolean; challenges: NonNullable<GameState['challenges']>; showMystery: boolean; selectedPosition?: number; highlightedSongId?: string; result?: GameState['lastResult']; place: (position: number) => void; challenge: (position: number) => void; confirm: () => void; confirmWithTitle: () => void; t: T }) {
  const [dragging, setDragging] = useState(false), [hovered, setHovered] = useState<number | null>(null), [offset, setOffset] = useState({ x: 0, y: 0 });
  const failedPlacement = useMemo(() => result && !result.correct && !result.guaranteed && result.cardOwnerId === result.playerId && result.placement !== undefined && currentSong ? { song: currentSong, placement: result.placement } : null, [result, currentSong]);
  const [departingFailure, setDepartingFailure] = useState<typeof failedPlacement>(null);
  const previousFailure = useRef<typeof failedPlacement>(null);
  const failureKey = failedPlacement ? `${failedPlacement.song.id}:${failedPlacement.placement}` : '';
  useEffect(() => {
    if (failedPlacement) { previousFailure.current = failedPlacement; setDepartingFailure(null); return; }
    if (!previousFailure.current) return;
    const leaving = previousFailure.current;
    previousFailure.current = null;
    setDepartingFailure(leaving);
    const timer = window.setTimeout(() => setDepartingFailure(null), 650);
    return () => window.clearTimeout(timer);
  }, [failureKey, failedPlacement]);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; hovered: number | null } | null>(null);
  const findDrop = (clientY: number) => { const zones = [...document.querySelectorAll<HTMLElement>(`[data-board="${player.id}"] .drop-zone`)]; return zones.reduce<{ index: number; distance: number } | null>((best, zone) => { const rect = zone.getBoundingClientRect(), distance = Math.abs(clientY - (rect.top + rect.bottom) / 2), index = Number(zone.dataset.dropIndex); return !best || distance < best.distance ? { index, distance } : best; }, null)?.index ?? null; };
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPlace || !event.isPrimary || event.button !== 0) return;
    const hoveredPosition = findDrop(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, hovered: hoveredPosition };
    setDragging(true);
    setHovered(hoveredPosition);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const hoveredPosition = findDrop(event.clientY);
    activeDrag.hovered = hoveredPosition;
    setOffset({ x: event.clientX - activeDrag.startX, y: event.clientY - activeDrag.startY });
    setHovered(hoveredPosition);
  };
  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    if (!cancelled && activeDrag.hovered !== null) place(activeDrag.hovered);
    setDragging(false);
    setHovered(null);
    setOffset({ x: 0, y: 0 });
  };
  const mysteryRecord = (compact: boolean) => <button className={`mystery-track ${compact ? 'in-slot' : 'at-deck'} ${canPlace ? 'draggable' : 'spectator'} ${dragging ? 'dragging' : ''}`} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }} disabled={!canPlace} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => finishPointer(event)} onPointerCancel={event => finishPointer(event, true)}><i className="mystery-vinyl"><em>HITSTER</em></i>{!compact && <span>{canPlace ? t('dragTrack') : t('watchingDrag', { name: player.nickname })}</span>}<b>⋮⋮</b></button>;
  const challengeMarkers = (position: number) => challenges.filter(item => item.position === position).map(item => <i className="challenge-token" key={item.playerId}>H</i>);
  const interactable = canPlace || challengeMode;
  const showOrderHint = showMystery && player.timeline.length === 1;
  const wonPoint = Boolean(result && (result.correct || result.guaranteed || result.cardOwnerId !== result.playerId));
  const transientFailure = failedPlacement ?? departingFailure;
  const transientIndex = transientFailure ? Math.min(transientFailure.placement, player.timeline.length) : -1;
  const slotCount = player.timeline.length + 1;
  return <section className="timeline" data-board={player.id}><div className="timeline-title"><div><small>HITSTER</small><h2>{isOwn ? t('yourBoard') : t('boardOf', { name: player.nickname })}</h2></div></div>{showMystery && selectedPosition === undefined && mysteryRecord(false)}<div className={`chart-list ${challengeMode ? 'challenge-mode' : ''}`}>{Array.from({ length: slotCount }, (_, index) => { const isTransientSlot = Boolean(transientFailure && index === transientIndex); const cardIndex = transientFailure && index > transientIndex ? index - 1 : index; const card = isTransientSlot ? undefined : player.timeline[cardIndex]; const isLatest = card?.song.id === highlightedSongId; const hint = showOrderHint ? (index === 0 ? t('beforeOrder') : t('afterOrder')) : null; return <div className="chart-slot" key={`slot-${index}`}>{showMystery && selectedPosition === index ? <div data-drop-index={index} className={`drop-zone occupied ${hovered === index ? 'hovered' : ''}`}>{mysteryRecord(true)}<span className="challenge-stack">{challengeMarkers(index)}</span></div> : <button data-drop-index={index} className={`drop-zone ${interactable ? 'available' : ''} ${hovered === index ? 'hovered' : ''} ${hint ? 'hint' : ''}`} disabled={!interactable} onClick={() => canPlace ? place(index) : challenge(index)} aria-label={t('placePosition', { position: index + 1 })}><span className="order-hint">{hint}</span><span className="challenge-stack">{challengeMarkers(index)}</span></button>}{isTransientSlot && transientFailure && <article data-song-id={transientFailure.song.id} className={`chart-card failed-card ${departingFailure ? 'destroying' : ''}`}><div className="chart-year"><strong>{transientFailure.song.year}</strong></div><div className="chart-copy"><strong>{transientFailure.song.title}</strong><span>{transientFailure.song.artist}</span><b className="result-badge">× {t('noPoint')}</b></div></article>}{card && <article data-song-id={card.song.id} className={`chart-card ${decadeClass(card.song.year)} ${isLatest ? `latest-card ${wonPoint ? 'won' : 'missed'}` : ''}`}><div className="chart-year"><strong>{card.song.year}</strong></div><div className="chart-copy"><strong>{card.song.title}</strong><span>{card.song.artist}</span>{isLatest && <b className="result-badge">{wonPoint ? `✓ ${t('pointWon')}` : `× ${t('noPoint')}`}</b>}</div></article>}</div>; })}</div>{canPlace && selectedPosition !== undefined && <div className="confirm-tray"><div className="confirm-actions"><button onClick={confirm}>{t('confirmPosition')}</button><button className="primary" onClick={confirmWithTitle}>{t('confirmYearTitleArtist')}</button></div></div>}</section>;
}

function decadeClass(year: number) {
  const decade = Math.floor(year / 10) * 10;
  if (decade < 1960) return 'decade-50';
  if (decade > 2020) return 'decade-20';
  return `decade-${String(decade).slice(-2)}`;
}

function HostControls({ state, spotify, startRound, replaceSong, connectSpotify, t }: { state: GameState; spotify: ReturnType<typeof useSpotifyPlayer>; startRound: () => void; replaceSong: () => void; connectSpotify: () => Promise<void>; t: T }) {
  if (spotify.status !== 'ready') return <section className="host-controls compact"><button className="spotify-button" onClick={connectSpotify}>{t('reconnectSpotify')}</button></section>;
  return <section className="host-controls compact">{(state.phase === 'ready' || state.phase === 'revealed') && <button className="primary" onClick={startRound}>{t('playNext')}</button>}{state.phase === 'placing' && <div className="dj-toolbar"><button className="replace-link" onClick={replaceSong}>{t('replaceSong')}</button></div>}</section>;
}
