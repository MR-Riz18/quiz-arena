import { Ghost, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../utils/cn.js';

export function Skeleton({ className, lines = 3 }) {
  return (
    <div className={cn('animate-pulse space-y-3', className)} aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded-lg bg-navy-700" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }) {
  return <div className={cn('card-pad animate-pulse', className)}><Skeleton lines={4} /></div>;
}

export function EmptyState({ icon, title, hint, action }) {
  const Icon = icon || Ghost;
  return (
    <div className="card-pad flex flex-col items-center py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-700">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="mb-1 text-lg font-bold text-white">{title}</h3>
      {hint && <p className="mb-5 max-w-sm text-sm text-slate-400">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="card-pad flex flex-col items-center py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertTriangle className="h-7 w-7 text-red-400" />
      </div>
      <h3 className="mb-1 text-lg font-bold text-white">Something went wrong</h3>
      <p className="mb-5 max-w-sm text-sm text-slate-400">{message || 'Please try again.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary !px-4 !py-2 text-sm">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  );
}
