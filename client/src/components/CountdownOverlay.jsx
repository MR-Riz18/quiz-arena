import { useEffect, useState } from 'react';

// Full-screen 3-2-1 overlay driven by the server's startsInMs.
// Each number punches in with a zoom, holds, then shrinks out — fast and juicy.
export default function CountdownOverlay({ startsInMs }) {
  const [n, setN] = useState(() => Math.max(1, Math.ceil((startsInMs || 3000) / 1000)));

  useEffect(() => {
    const total = Math.max(1, Math.ceil((startsInMs || 3000) / 1000));
    setN(total);
    const startedAt = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, total - Math.floor((Date.now() - startedAt) / 1000));
      setN(left);
      if (left <= 0) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  }, [startsInMs]);

  if (n <= 0) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-navy-950/90 backdrop-blur-sm">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
        Match starting
      </p>
      <div className="relative flex items-center justify-center">
        {/* radiating ring */}
        <div
          key={`ring-${n}`}
          className="absolute h-44 w-44 animate-ping rounded-full border-2 border-brand-violet/40 sm:h-56 sm:w-56"
          style={{ animationDuration: '0.9s', animationIterationCount: 1 }}
        />
        <div
          key={n}
          className="animate-countdown-zoom bg-gradient-to-br from-brand-blue via-white to-brand-violet bg-clip-text text-8xl font-black tabular-nums text-transparent sm:text-9xl"
        >
          {n}
        </div>
      </div>
      {/* second dots */}
      <div className="mt-6 flex gap-2">
        {Array.from({ length: Math.max(1, Math.ceil((startsInMs || 3000) / 1000)) }).map((_, i, arr) => (
          <span
            key={i}
            className={
              i < arr.length - n
                ? 'h-2 w-2 rounded-full bg-brand-violet'
                : 'h-2 w-2 rounded-full bg-navy-600'
            }
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-400">Get ready…</p>
    </div>
  );
}
