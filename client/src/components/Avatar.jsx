import { cn } from '../utils/cn.js';

const BG = {
  default: 'from-brand-blue to-brand-violet',
  violet: 'from-violet-500 to-purple-700',
  blue: 'from-sky-400 to-blue-600',
  teal: 'from-teal-400 to-emerald-600',
  amber: 'from-amber-400 to-orange-600',
  rose: 'from-rose-400 to-pink-600',
  emerald: 'from-emerald-400 to-green-600',
  indigo: 'from-indigo-400 to-violet-700',
};

// Colored initial circle. `avatar` is the stored preset id (or 'default').
export default function Avatar({ username = '?', avatar = 'default', size = 'md', className }) {
  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-xl',
    xl: 'h-20 w-20 text-3xl',
  };
  const bg = BG[avatar] || BG.default;
  const initial = (username || '?').charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-extrabold text-white',
        bg,
        sizes[size] || sizes.md,
        className
      )}
      aria-label={username}
    >
      {initial}
    </div>
  );
}
