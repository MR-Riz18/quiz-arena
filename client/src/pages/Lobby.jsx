import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Copy, Check, Crown, Play, LogOut, Loader2, Users, Settings2, WifiOff, Share2,
} from 'lucide-react';
import { roomApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from '../components/Avatar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import CountdownOverlay from '../components/CountdownOverlay.jsx';
import { CardSkeleton, ErrorState } from '../components/StateViews.jsx';
import { cn } from '../utils/cn.js';

export default function Lobby() {
  const { code } = useParams();
  const upperCode = (code || '').toUpperCase();
  const { user } = useAuth();
  const { subscribe, emit, joinRoom, leaveRoom, setActiveMatch } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [countdownMs, setCountdownMs] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await roomApi.get(upperCode);
      setRoom(r);
    } catch (e) {
      setError(e.message || 'Could not load room');
    } finally {
      setLoading(false);
    }
  }, [upperCode]);

  useEffect(() => {
    load();
  }, [load]);

  // Socket wiring for the lobby.
  useEffect(() => {
    if (!upperCode) return;
    joinRoom(upperCode);
    const unsubs = [
      subscribe('room:updated', (payload) => {
        if (payload?.room) setRoom(payload.room);
      }),
      subscribe('room:player-joined', ({ user: u }) => {
        if (u) toast.info(`${u.username} joined the room`);
      }),
      subscribe('room:player-left', ({ username }) => {
        if (username) toast.info(`${username} left the room`);
      }),
      subscribe('room:error', ({ message }) => {
        toast.error(message || 'Room action failed');
        setStarting(false);
      }),
      subscribe('match:accepted', () => {
        setStarting(true);
      }),
      subscribe('match:countdown', ({ matchId, startsInMs }) => {
        setCountdownMs(startsInMs ?? 3000);
        // Remember the match id early so a refresh mid-countdown can recover.
        if (matchId) setActiveMatch(matchId, upperCode);
      }),
      subscribe('match:started', ({ matchId, roomCode }) => {
        if (!matchId) return;
        setActiveMatch(matchId, roomCode || upperCode);
        navigate(`/match/${matchId}`, { state: { roomCode: roomCode || upperCode }, replace: true });
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      leaveRoom(upperCode);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upperCode]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(upperCode);
    } catch {
      /* clipboard unavailable — still show feedback */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleReady = () => {
    const me = room?.players?.find((p) => String(p.userId) === String(user.id || user._id));
    emit(me?.ready ? 'room:unready' : 'room:ready', { code: upperCode });
  };

  const startMatch = () => {
    setStarting(true);
    emit('match:start', { code: upperCode });
  };

  const doLeave = async () => {
    setLeaving(true);
    try {
      await roomApi.leave(upperCode);
    } catch (e) {
      toast.error(e.message || 'Could not leave room');
    } finally {
      setLeaving(false);
      setConfirmLeave(false);
      leaveRoom(upperCode);
      navigate('/rooms');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <CardSkeleton />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <ErrorState message={error || 'Room not found'} onRetry={load} />
      </div>
    );
  }

  const myId = String(user.id || user._id);
  const players = room.players || [];
  const me = players.find((p) => String(p.userId) === myId);
  const isHost = String(room.host?.id || room.host) === myId;
  const allReady = players.length >= 2 && players.every((p) => p.ready);
  const canStart = isHost && players.length >= 2 && allReady;
  const max = room.config?.maxPlayers ?? 8;

  const startHint = !isHost
    ? 'Only the host can start the match.'
    : players.length < 2
      ? 'Need at least 2 players to start.'
      : !allReady
        ? 'Waiting for everyone to ready up.'
        : 'Everyone is ready — start the battle!';

  const cfg = room.config || {};

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {countdownMs !== null && <CountdownOverlay startsInMs={countdownMs} />}

      {/* Header */}
      <div className="card-pad mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">{room.name}</h1>
              {room.visibility === 'private' && (
                <span className="rounded-full bg-brand-violet/15 px-2.5 py-0.5 text-xs font-semibold text-brand-violet">
                  Private
                </span>
              )}
            </div>
            <p className="muted mt-1 flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {players.length}/{max} players
            </p>
          </div>
          <button
            onClick={copyCode}
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-navy-600 bg-navy-800 px-4 py-2.5 transition hover:border-brand-blue/60"
            title="Copy room code"
          >
            <span className="font-mono text-2xl font-extrabold tracking-[0.3em] text-white">{upperCode}</span>
            {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5 text-slate-400" />}
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Share2 className="h-3.5 w-3.5" /> Share the code with friends — it's the invite for private rooms.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Players */}
        <div className="card-pad">
          <h2 className="mb-4 font-bold text-white">Players</h2>
          <ul className="space-y-2">
            {players.map((p) => {
              const pid = String(p.userId);
              const hostHere = String(room.host?.id || room.host) === pid;
              return (
                <li
                  key={pid}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3.5 py-3',
                    pid === myId ? 'border-brand-blue/50 bg-brand-blue/5' : 'border-navy-700 bg-navy-800/60'
                  )}
                >
                  <Avatar username={p.username} avatar={p.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-white">{p.username}</span>
                      {hostHere && <Crown className="h-4 w-4 shrink-0 text-amber-400" />}
                      {pid === myId && <span className="text-xs text-brand-blue">(you)</span>}
                    </div>
                    {!p.connected && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <WifiOff className="h-3 w-3" /> disconnected
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
                      p.ready ? 'bg-green-500/15 text-green-400' : 'bg-navy-700 text-slate-400'
                    )}
                  >
                    {p.ready ? 'Ready' : 'Not ready'}
                  </span>
                </li>
              );
            })}
          </ul>
          {players.length < max && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Waiting for more players… share the code <span className="font-mono font-bold text-slate-300">{upperCode}</span>
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4">
          <div className="card-pad">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
              <Settings2 className="h-4 w-4 text-slate-400" /> Match setup
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Questions</dt><dd className="font-semibold text-white">{cfg.questionCount ?? 5}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Time per question</dt><dd className="font-semibold text-white">{cfg.timePerQuestion ?? 15}s</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Difficulty</dt><dd className="font-semibold capitalize text-white">{cfg.difficulty ?? 'mixed'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Max players</dt><dd className="font-semibold text-white">{max}</dd></div>
            </dl>
          </div>

          <div className="card-pad space-y-3">
            <button
              onClick={toggleReady}
              className={cn('w-full', me?.ready ? 'btn-secondary' : 'btn-primary')}
            >
              {me?.ready ? 'Not ready' : "I'm ready"}
            </button>
            <button onClick={startMatch} disabled={!canStart || starting} className="btn-primary w-full">
              {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              {starting ? 'Starting…' : 'Start match'}
            </button>
            <p className="text-center text-xs text-slate-500">{startHint}</p>
            <button
              onClick={() => setConfirmLeave(true)}
              className="btn-danger w-full !py-2 text-sm"
              disabled={leaving}
            >
              <LogOut className="h-4 w-4" /> Leave room
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this room?"
        message={isHost ? 'You are the host — the longest-waiting player will take over.' : 'You can rejoin later with the room code.'}
        confirmLabel="Leave"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
