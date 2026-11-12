import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Trophy, ChevronLeft, ChevronRight, Swords, Clock } from 'lucide-react';
import { playerApi } from '../api/index.js';
import Avatar from '../components/Avatar.jsx';
import RatingDelta from '../components/RatingDelta.jsx';
import { CardSkeleton, ErrorState, EmptyState } from '../components/StateViews.jsx';
import { cn } from '../utils/cn.js';
import { formatNumber, formatTimeAgo } from '../utils/format.js';

const PAGE_SIZE = 10;

function formatDuration(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function History() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [mode, setMode] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await playerApi.myMatches({ mode, result, page, limit: PAGE_SIZE });
      setMatches(data.matches || []);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Could not load match history');
    } finally {
      setLoading(false);
    }
  }, [mode, result, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const selectClass =
    'rounded-xl border border-navy-700 bg-navy-800 px-3 py-2 text-sm font-semibold text-slate-200 focus:border-brand-blue focus:outline-none';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="page-title mb-1 flex items-center gap-2">
        <HistoryIcon className="h-6 w-6 text-brand-violet" /> Match history
      </h1>
      <p className="muted mb-6">Every battle you've fought, newest first.</p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={selectClass} value={mode} onChange={setFilter(setMode)} aria-label="Filter by mode">
          <option value="">All modes</option>
          <option value="competitive">Competitive</option>
          <option value="casual">Casual</option>
        </select>
        <select className={selectClass} value={result} onChange={setFilter(setResult)} aria-label="Filter by result">
          <option value="">Wins & losses</option>
          <option value="win">Wins only</option>
          <option value="loss">Losses only</option>
        </select>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          hint="Play your first battle — it'll show up here."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-navy-800">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => navigate(`/match/${m.id}/results`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-navy-800/50"
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        m.result === 'win' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      )}
                    >
                      <Trophy className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-white">
                        <span className={m.result === 'win' ? 'text-green-400' : 'text-red-400'}>
                          {m.result === 'win' ? 'Victory' : 'Defeat'}
                        </span>
                        <span className="muted font-semibold">
                          vs {m.opponents.length ? m.opponents.map((o) => o.username).join(', ') : '—'}
                        </span>
                        {m.forfeit && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                            FORFEIT
                          </span>
                        )}
                      </p>
                      <p className="muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                        <span className="capitalize">{m.mode}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Swords className="h-3 w-3" /> Rank #{m.myRank}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {formatDuration(m.durationSec)}
                        </span>
                        <span>·</span>
                        <span>{formatTimeAgo(m.date)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-extrabold tabular-nums text-white">
                        {formatNumber(m.myScore)}
                      </span>
                      <RatingDelta delta={m.ratingDelta} size="sm" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

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
