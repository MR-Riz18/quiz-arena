import { useCallback, useEffect, useState } from 'react';
import { Trophy, Crosshair, Search, ChevronLeft, ChevronRight, Medal } from 'lucide-react';
import { leaderboardApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import TierBadge from '../components/TierBadge.jsx';
import { CardSkeleton, ErrorState, EmptyState } from '../components/StateViews.jsx';
import { cn } from '../utils/cn.js';
import { formatNumber, pct } from '../utils/format.js';

const TABS = [
  { key: 'rating', label: 'Rating', icon: Trophy, hint: 'Top players by Elo rating' },
  { key: 'wins', label: 'Wins', icon: Medal, hint: 'Most match victories' },
  { key: 'accuracy', label: 'Accuracy', icon: Crosshair, hint: 'Best answer accuracy · min 10 matches' },
];

const PAGE_SIZE = 20;

export default function Leaderboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('rating');
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const myId = String(user?.id || '');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fn =
        tab === 'rating' ? leaderboardApi.byRating : tab === 'wins' ? leaderboardApi.byWins : leaderboardApi.byAccuracy;
      const data = await fn({ page, limit: PAGE_SIZE, search: debounced });
      setRows(data.rows || []);
      setMe(data.me || null);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Could not load the leaderboard');
    } finally {
      setLoading(false);
    }
  }, [tab, page, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const switchTab = (key) => {
    setTab(key);
    setPage(1);
  };

  const active = TABS.find((t) => t.key === tab);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="page-title mb-1">Global leaderboard</h1>
      <p className="muted mb-6">{active.hint}</p>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition',
              tab === t.key
                ? 'border-brand-violet bg-brand-violet/15 text-white'
                : 'border-navy-700 bg-navy-800 text-slate-400 hover:border-navy-600 hover:text-white'
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Your rank card */}
      {me && (
        <div className="card-pad mb-4 flex items-center gap-4 border-brand-violet/40">
          <Avatar username={me.username} avatar={me.avatar} />
          <div className="flex-1">
            <p className="text-sm font-bold text-white">
              {me.username} <span className="text-xs font-semibold text-brand-blue">(you)</span>
            </p>
            <p className="muted text-xs">
              {tab === 'rating' && <><span className="font-bold text-white">{formatNumber(me.rating)}</span> rating · </>}
              {tab === 'wins' && <><span className="font-bold text-white">{me.wins}</span> wins · </>}
              {tab === 'accuracy' && <><span className="font-bold text-white">{me.accuracy}%</span> accuracy · </>}
              <TierBadge tier={me.tier} size="sm" showIcon={false} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tabular-nums text-white">#{me.rank}</p>
            <p className="muted text-[11px]">your rank</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9"
          placeholder="Search players…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState title="No players found" hint="Try a different search." />
      ) : (
        <>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-navy-800">
              {rows.map((r) => {
                const isSelf = String(r.userId) === myId;
                return (
                  <li
                    key={r.userId}
                    className={cn('flex items-center gap-3 px-4 py-3', isSelf && 'bg-brand-violet/10')}
                  >
                    <span className="w-10 shrink-0 text-center text-sm font-extrabold tabular-nums text-slate-400">
                      {r.rank <= 3 ? (
                        <Medal
                          className={cn(
                            'mx-auto h-5 w-5',
                            r.rank === 1 ? 'text-amber-400' : r.rank === 2 ? 'text-slate-300' : 'text-orange-400'
                          )}
                        />
                      ) : (
                        r.rank
                      )}
                    </span>
                    <Avatar username={r.username} avatar={r.avatar} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {r.username}
                        {isSelf && <span className="ml-1 text-xs text-brand-blue">(you)</span>}
                      </p>
                      <p className="muted text-[11px]">
                        {r.wins}W · {r.losses}L · {pct(r.wins, r.matchesPlayed)} win rate
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <TierBadge tier={r.tier} size="sm" showIcon={false} />
                    </div>
                    <span className="w-20 text-right text-sm font-extrabold tabular-nums text-white">
                      {tab === 'rating' && formatNumber(r.rating)}
                      {tab === 'wins' && `${r.wins} wins`}
                      {tab === 'accuracy' && `${r.accuracy}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="btn-secondary !px-3 !py-2 text-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="muted text-sm tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              className="btn-secondary !px-3 !py-2 text-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
