import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../utils/cn.js';

// Green "+24" / red "−16" chip for Elo changes. Null/0 renders neutral.
export default function RatingDelta({ delta, size = 'md' }) {
  if (delta == null) {
    return <span className="text-xs text-slate-600">—</span>;
  }
  const d = Number(delta);
  const positive = d > 0;
  const flat = d === 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg font-extrabold tabular-nums',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-sm',
        positive
          ? 'bg-green-500/15 text-green-400'
          : flat
            ? 'bg-navy-700 text-slate-400'
            : 'bg-red-500/15 text-red-400'
      )}
    >
      {positive ? (
        <TrendingUp className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      ) : flat ? (
        <Minus className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      ) : (
        <TrendingDown className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      )}
      {positive ? `+${d}` : flat ? '±0' : `−${Math.abs(d)}`}
    </span>
  );
}
