import { Trophy } from 'lucide-react';
import { cn } from '../utils/cn.js';

// Tier ladder shared with the server (services/ratings.js TIERS).
export const TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'];
export const TIER_MIN = { Bronze: 0, Silver: 1000, Gold: 1200, Platinum: 1400, Diamond: 1600, Master: 1800 };

const TIER_STYLES = {
  Bronze: 'bg-amber-800/30 text-amber-600 border-amber-700/50',
  Silver: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  Gold: 'bg-amber-400/15 text-amber-300 border-amber-400/40',
  Platinum: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/40',
  Diamond: 'bg-violet-400/15 text-violet-300 border-violet-400/40',
  Master: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
};

export function nextTierInfo(tier, rating) {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx === -1 || idx === TIER_ORDER.length - 1) return null;
  const next = TIER_ORDER[idx + 1];
  const floor = TIER_MIN[tier] ?? 0;
  const ceil = TIER_MIN[next];
  const progress = Math.min(1, Math.max(0, ((rating ?? 0) - floor) / (ceil - floor)));
  return { next, needed: ceil - (rating ?? 0), progress };
}

export default function TierBadge({ tier = 'Bronze', size = 'md', showIcon = true }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold',
        TIER_STYLES[tier] || TIER_STYLES.Bronze,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-sm'
      )}
    >
      {showIcon && <Trophy className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {tier}
    </span>
  );
}
