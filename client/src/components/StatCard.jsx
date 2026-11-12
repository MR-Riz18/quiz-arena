import { cn } from '../utils/cn.js';

export default function StatCard({ label, value, icon: Icon, accent = 'text-brand-blue', sub }) {
  return (
    <div className="card-pad !p-4 sm:!p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <Icon className={cn('h-5 w-5', accent)} />}
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-white sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
