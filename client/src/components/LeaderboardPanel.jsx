import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { Crown, Flame, WifiOff, ChevronUp, ChevronDown, UserX } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { cn } from '../utils/cn.js';
import { formatNumber } from '../utils/format.js';

// Smoothly ticks a number toward its target (score changes) — cheap rAF tween.
function AnimatedScore({ value }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let raf;
    const start = performance.now();
    const dur = 600;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="tabular-nums">{formatNumber(display)}</span>;
}

// Live leaderboard with FLIP-lite reorder animation.
// Entries: [{userId, username, avatar, score, correctCount, streak, avgTimeMs,
//            connected, abandoned, rank, rankDelta}]
export default function LeaderboardPanel({ entries = [], selfId, compact = false }) {
  const sorted = [...entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const listRef = useRef(null);
  const positions = useRef(new Map()); // userId -> last natural top

  // FLIP: measure before paint, invert the delta, then animate to natural spot.
  // Idempotent under StrictMode (second pass measures no movement).
  useLayoutEffect(() => {
    const els = [...(listRef.current?.querySelectorAll('[data-uid]') || [])];
    const measured = new Map();
    els.forEach((el) => measured.set(el.dataset.uid, el.getBoundingClientRect().top));
    els.forEach((el) => {
      const oldTop = positions.current.get(el.dataset.uid);
      const newTop = measured.get(el.dataset.uid);
      const dy = oldTop - newTop;
      if (oldTop != null && Math.abs(dy) > 2) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        void el.offsetHeight; // force reflow so the transition below animates
        el.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = 'translateY(0)';
      }
    });
    positions.current = measured;
  });

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-navy-700 px-4 py-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Live leaderboard</h3>
      </div>
      <ul ref={listRef} className="nice-scroll max-h-96 divide-y divide-navy-800 overflow-y-auto">
        {sorted.map((e) => {
          const isSelf = String(e.userId) === String(selfId);
          const abandoned = !!e.abandoned;
          const reconnecting = !abandoned && e.connected === false;
          const movedUp = (e.rankDelta ?? 0) > 0;
          const movedDown = (e.rankDelta ?? 0) < 0;
          const moved = movedUp || movedDown;
          return (
            <li
              key={String(e.userId)}
              data-uid={String(e.userId)}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                isSelf && 'bg-brand-violet/10',
                (reconnecting || abandoned) && 'opacity-70',
                moved && 'animate-row-flash'
              )}
            >
              <span
                className={cn(
                  'flex w-6 shrink-0 items-center justify-center text-sm font-extrabold tabular-nums',
                  e.rank === 1 ? 'text-amber-300' : 'text-slate-400'
                )}
              >
                {e.rank === 1 ? <Crown className="h-4 w-4" /> : e.rank}
              </span>
              <Avatar username={e.username} avatar={e.avatar} size={compact ? 'xs' : 'sm'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-white">
                    {e.username}
                    {isSelf && <span className="ml-1 text-xs text-brand-blue">(you)</span>}
                  </span>
                  {movedUp && <ChevronUp className="h-4 w-4 shrink-0 text-green-400" />}
                  {movedDown && <ChevronDown className="h-4 w-4 shrink-0 text-red-400" />}
                  {reconnecting && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      <WifiOff className="h-3 w-3" /> reconnecting…
                    </span>
                  )}
                  {abandoned && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-navy-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                      <UserX className="h-3 w-3" /> abandoned
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{e.correctCount ?? 0} correct</span>
                  {e.streak > 1 && (
                    <span className="inline-flex items-center gap-0.5 text-orange-400">
                      <Flame className="h-3 w-3" /> {e.streak}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-extrabold text-white">
                <AnimatedScore value={e.score ?? 0} />
              </span>
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No scores yet.</li>
        )}
      </ul>
    </div>
  );
}
