import { useEffect, useState } from 'react';
import { cn } from '../utils/cn.js';

// Animated countdown driven ONLY by the server-provided deadline.
// The client never extends or decides anything — it just renders time left.
export default function TimerBar({ deadline, totalMs, onExpire }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, (deadline || 0) - Date.now()));

  useEffect(() => {
    setRemaining(Math.max(0, (deadline || 0) - Date.now()));
    if (!deadline) return;
    let raf;
    const tick = () => {
      const ms = deadline - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms > 0) {
        raf = requestAnimationFrame(tick);
      } else if (onExpire) {
        onExpire();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = totalMs || 15000;
  const frac = Math.min(1, Math.max(0, remaining / total));
  const secs = Math.ceil(remaining / 1000);
  const urgent = remaining <= 5000;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold">
        <span className={cn(urgent ? 'text-red-400' : 'text-slate-300')}>
          {urgent ? 'Hurry up!' : 'Time left'}
        </span>
        <span
          className={cn(
            'tabular-nums rounded-md px-2 py-0.5',
            urgent ? 'bg-red-500/20 text-red-300' : 'bg-navy-700 text-slate-200'
          )}
        >
          {secs}s
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-700">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-100 ease-linear',
            urgent ? 'bg-gradient-to-r from-red-500 to-orange-400' : 'bg-gradient-to-r from-brand-blue to-brand-violet'
          )}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
    </div>
  );
}
