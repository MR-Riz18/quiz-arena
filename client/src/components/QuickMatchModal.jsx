import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Swords, Zap, Coffee, Loader2, Radar } from 'lucide-react';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { categoryApi } from '../api/index.js';
import { cn } from '../utils/cn.js';

// Quick Match: pick a mode + category, get paired by the server matchmaker.
// Transport is the socket (matchmaking:join/cancel); the server answers with
// matchmaking:queued|matched|error and finally match:found -> lobby.
export default function QuickMatchModal({ open, onClose }) {
  const navigate = useNavigate();
  const { subscribe, emit } = useSocket();
  const { toast } = useToast();
  const [mode, setMode] = useState('competitive');
  const [category, setCategory] = useState('mixed');
  const [categories, setCategories] = useState([]);
  const [phase, setPhase] = useState('setup'); // setup | searching
  const [waitSecs, setWaitSecs] = useState(0);
  const [position, setPosition] = useState(null);
  const searchingRef = useRef(false);

  // Load categories when the modal opens.
  useEffect(() => {
    if (!open) return;
    setPhase('setup');
    setWaitSecs(0);
    setPosition(null);
    searchingRef.current = false;
    categoryApi
      .list()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open ]);

  // Wait-time ticker while searching.
  useEffect(() => {
    if (!open || phase !== 'searching') return;
    const t = setInterval(() => setWaitSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open, phase]);

  // Server events for this flow.
  useEffect(() => {
    if (!open) return;
    const offs = [
      subscribe('matchmaking:queued', ({ position: pos } = {}) => {
        setPosition(pos ?? null);
      }),
      subscribe('matchmaking:matched', () => {
        // Partner found — match:found with the room code follows.
      }),
      subscribe('match:found', ({ roomCode } = {}) => {
        if (!roomCode) return;
        searchingRef.current = false;
        onClose();
        toast.success('Opponent found — good luck!');
        navigate(`/room/${roomCode}`);
      }),
      subscribe('matchmaking:error', ({ message } = {}) => {
        searchingRef.current = false;
        setPhase('setup');
        toast.error(message || 'Could not join matchmaking');
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [open, subscribe, onClose, navigate, toast]);

  // Leaving while queued cancels the search.
  useEffect(() => {
    if (!open && searchingRef.current) {
      emit('matchmaking:cancel', {});
      searchingRef.current = false;
    }
  }, [open, emit]);

  if (!open) return null;

  const startSearch = () => {
    setWaitSecs(0);
    setPosition(null);
    setPhase('searching');
    searchingRef.current = true;
    emit('matchmaking:join', { mode, category });
  };

  const cancelSearch = () => {
    emit('matchmaking:cancel', {});
    searchingRef.current = false;
    setPhase('setup');
  };

  const close = () => {
    if (searchingRef.current) {
      emit('matchmaking:cancel', {});
      searchingRef.current = false;
    }
    onClose();
  };

  const fmtWait = `${Math.floor(waitSecs / 60)}:${String(waitSecs % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" onClick={close}>
      <div
        className="card-pad w-full max-w-md animate-reveal-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Quick match"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <Swords className="h-5 w-5 text-brand-violet" /> Quick Match
          </h2>
          <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {phase === 'setup' ? (
          <>
            <p className="label">Mode</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('competitive')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition',
                  mode === 'competitive'
                    ? 'border-brand-violet bg-brand-violet/15 text-white'
                    : 'border-navy-700 bg-navy-800 text-slate-400 hover:border-navy-600'
                )}
              >
                <Zap className="h-4 w-4 text-amber-400" /> Competitive
              </button>
              <button
                onClick={() => setMode('casual')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition',
                  mode === 'casual'
                    ? 'border-brand-blue bg-brand-blue/15 text-white'
                    : 'border-navy-700 bg-navy-800 text-slate-400 hover:border-navy-600'
                )}
              >
                <Coffee className="h-4 w-4 text-brand-blue" /> Casual
              </button>
            </div>
            <p className="muted mb-1.5 text-xs">
              {mode === 'competitive'
                ? 'Rated — Elo points on the line.'
                : 'Just for fun — no rating changes.'}
            </p>

            <label className="label mt-4" htmlFor="qm-cat">Category</label>
            <select
              id="qm-cat"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="mixed">Mixed (any category)</option>
              {categories.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button onClick={startSearch} className="btn-primary mt-5 w-full">
              <Radar className="h-5 w-5" /> Find opponent
            </button>
            <p className="muted mt-3 text-center text-xs">
              Pairs you with a similarly-rated player. Wider net the longer you wait.
            </p>
          </>
        ) : (
          <div className="py-6 text-center">
            <div className="relative mx-auto mb-4 h-20 w-20">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-violet/20" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-violet/15">
                <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
              </span>
            </div>
            <h3 className="text-lg font-extrabold text-white">
              Searching<span className="animate-pulse">…</span>
            </h3>
            <p className="muted mt-1 tabular-nums">
              {fmtWait} elapsed
              {position ? ` · #${position} in queue` : ''}
            </p>
            <p className="muted mt-1 text-xs">
              {mode === 'competitive' ? 'Competitive' : 'Casual'} ·{' '}
              {category === 'mixed' ? 'Mixed categories' : 'Chosen category'}
            </p>
            <button onClick={cancelSearch} className="btn-secondary mt-5">
              Cancel search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
