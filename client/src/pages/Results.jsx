import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Trophy, Medal, RotateCcw, ChevronDown, Check, X, Minus, UserX, Loader2, Flag } from 'lucide-react';
import { matchApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from '../components/Avatar.jsx';
import StatCard from '../components/StatCard.jsx';
import { CardSkeleton, ErrorState, EmptyState } from '../components/StateViews.jsx';
import { cn } from '../utils/cn.js';
import { formatNumber, pct, formatSeconds } from '../utils/format.js';

const LETTERS = ['A', 'B', 'C', 'D'];

// Animated count-up for Elo deltas (+24 / −16).
function RatingCountUp({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const dur = 900;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={cn('tabular-nums', value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-slate-400')}>
      {display > 0 ? `+${display}` : display < 0 ? `−${Math.abs(display)}` : '±0'}
    </span>
  );
}

export default function Results() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openIdx, setOpenIdx] = useState(null);
  const [rematching, setRematching] = useState(false);
  const myId = String(user?.id || user?._id || '');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    matchApi
      .get(matchId)
      .then((m) => {
        if (!alive) return;
        if (m.state !== 'completed') {
          // Match still running — send the player back into the battle.
          navigate(`/match/${matchId}`, { replace: true });
          return;
        }
        setMatch(m);
        // Phase 3: refresh the session so rating/tier update everywhere.
        refresh().catch(() => {});
      })
      .catch((e) => {
        if (alive) setError(e.message || 'Could not load results');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [matchId, navigate, refresh]);

  // Phase 2: real rematch — creates a fresh room with identical config and
  // drops the requester straight into its lobby. Others get a socket offer.
  const doRematch = async () => {
    if (rematching) return;
    setRematching(true);
    try {
      const { code } = await matchApi.rematch(matchId);
      navigate(`/room/${code}`);
    } catch (e) {
      toast.error(e.message || 'Could not create a rematch');
      setRematching(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><CardSkeleton /></div>
    );
  }
  if (error || !match) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <ErrorState message={error || 'Results not found'} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const placements = [...(match.placements || [])].sort((a, b) => a.rank - b.rank);
  const winner = placements[0];
  const iWon = winner && String(winner.userId) === myId;
  const forfeitWin = iWon && placements.some((p) => p.abandoned && String(p.userId) !== myId);
  const answers = match.answers || [];
  const questions = match.questions || [];

  const myAnswers = answers.filter((a) => String(a.userId) === myId);
  const myCorrect = myAnswers.filter((a) => a.correct).length;
  const myAvgTime = myAnswers.length
    ? myAnswers.reduce((s, a) => s + (a.timeMs || 0), 0) / myAnswers.length
    : 0;

  // Phase 3: Elo rating change for this match (competitive only).
  const myRating = (match.ratingChanges || []).find((r) => String(r.userId) === myId);
  const tierUp = myRating && myRating.tierAfter && myRating.tierBefore && myRating.tierAfter !== myRating.tierBefore;

  const answerFor = (qIdx, uid) =>
    answers.find((a) => a.questionIndex === qIdx && String(a.userId) === String(uid));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Winner banner */}
      <div className="card-pad mb-6 animate-reveal-pop text-center">
        <div className="animate-winner-pop mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 shadow-lg shadow-orange-500/30">
          <Trophy className="h-8 w-8 text-navy-950" />
        </div>
        <h1 className="page-title">
          {iWon ? 'You win! 🏆' : `${winner?.username || 'Someone'} takes the crown`}
        </h1>
        <p className="muted mt-1">
          {forfeitWin
            ? 'Won by forfeit — your opponent left the arena.'
            : iWon
              ? 'Flawless victory — the arena bows to you.'
              : 'Good battle. Run it back?'}
        </p>
        {match.forfeit && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-navy-700/70 px-3 py-1 text-xs font-semibold text-slate-300">
            <Flag className="h-3.5 w-3.5 text-amber-400" /> Match ended by forfeit
          </p>
        )}
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button onClick={doRematch} disabled={rematching} className="btn-primary">
            {rematching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RotateCcw className="h-5 w-5" />
            )}
            {rematching ? 'Creating rematch…' : 'Rematch'}
          </button>
          <Link to="/rooms" className="btn-secondary">Find another room</Link>
        </div>
        <p className="muted mt-3 text-xs">The other players get an invite they can join in one click.</p>
      </div>

      {/* Phase 3: rating change */}
      {myRating && (
        <div className="card-pad mb-6 flex items-center justify-center gap-6 text-center">
          <div>
            <p className="muted text-xs font-semibold uppercase tracking-wider">Rating change</p>
            <p className="mt-1 text-4xl font-extrabold">
              <RatingCountUp value={myRating.delta} />
            </p>
          </div>
          <div className="h-12 w-px bg-navy-700" />
          <div>
            <p className="muted text-xs font-semibold uppercase tracking-wider">New rating</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-white">{myRating.after}</p>
          </div>
          {tierUp && (
            <div className="animate-winner-pop rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Tier up!</p>
              <p className="mt-0.5 text-sm font-extrabold text-white">
                {myRating.tierBefore} → {myRating.tierAfter}
              </p>
            </div>
          )}
        </div>
      )}
      {match.mode === 'competitive' && !myRating && (
        <p className="muted mb-6 text-center text-xs">Rated match — rating changes are being calculated.</p>
      )}

      {/* Placements — staggered entrance */}
      <h2 className="mb-3 text-lg font-extrabold text-white">Final standings</h2>
      <div className="card mb-6 overflow-hidden">
        <ul className="divide-y divide-navy-800">
          {placements.map((p, i) => {
            const isSelf = String(p.userId) === myId;
            return (
              <li
                key={String(p.userId)}
                style={{ animationDelay: `${i * 90}ms` }}
                className={cn(
                  'animate-fade-slide-in flex items-center gap-3 px-4 py-3',
                  isSelf && 'bg-brand-violet/10',
                  p.abandoned && 'opacity-70'
                )}
              >
                <span className="flex w-8 items-center justify-center">
                  {p.rank === 1 ? (
                    <Trophy className="h-5 w-5 text-amber-400" />
                  ) : p.rank <= 3 ? (
                    <Medal className={cn('h-5 w-5', p.rank === 2 ? 'text-slate-300' : 'text-orange-400')} />
                  ) : (
                    <span className="text-sm font-extrabold tabular-nums text-slate-400">{p.rank}</span>
                  )}
                </span>
                <Avatar username={p.username} avatar={p.avatar} />
                <span className="flex-1 truncate text-sm font-bold text-white">
                  {p.username}
                  {isSelf && <span className="ml-1 text-xs text-brand-blue">(you)</span>}
                  {p.abandoned && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-navy-700 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-400">
                      <UserX className="h-3 w-3" /> abandoned
                    </span>
                  )}
                </span>
                <span className="text-sm font-extrabold tabular-nums text-white">{formatNumber(p.score)} pts</span>
              </li>
            );
          })}
          {placements.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No placements recorded.</li>
          )}
        </ul>
      </div>

      {/* My stats */}
      <h2 className="mb-3 text-lg font-extrabold text-white">Your performance</h2>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Score" value={formatNumber(match.scores?.[myId] ?? 0)} />
        <StatCard label="Accuracy" value={pct(myCorrect, myAnswers.length)} sub={`${myCorrect}/${myAnswers.length} correct`} />
        <StatCard label="Avg. response" value={myAnswers.length ? formatSeconds(myAvgTime) : '—'} />
        <StatCard label="Rank" value={placements.find((p) => String(p.userId) === myId)?.rank ?? '—'} />
      </div>

      {/* Question review */}
      <h2 className="mb-3 text-lg font-extrabold text-white">Question review</h2>
      {questions.length === 0 ? (
        <EmptyState title="No questions to review" hint="The question list wasn't included in this match record." />
      ) : (
        <div className="space-y-3">
          {questions.map((q, qi) => {
            const mine = answerFor(qi, myId);
            const myPick = mine?.optionIndex;
            const open = openIdx === qi;
            const correct = myPick === q.correctIndex;
            return (
              <div key={q.id || qi} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(open ? null : qi)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      myPick == null
                        ? 'bg-navy-700 text-slate-400'
                        : correct
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                    )}
                  >
                    {myPick == null ? <Minus className="h-4 w-4" /> : correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      Q{qi + 1}. {q.text}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {q.difficulty ? `${q.difficulty[0].toUpperCase()}${q.difficulty.slice(1)}` : ''}
                      {mine && mine.points > 0 && (
                        <span className="ml-2 font-bold text-green-400">+{formatNumber(mine.points)} pts</span>
                      )}
                    </span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="border-t border-navy-800 px-4 py-3.5">
                    <ul className="space-y-1.5">
                      {(q.options || []).map((opt, oi) => {
                        const isCorrect = oi === q.correctIndex;
                        const isMine = oi === myPick;
                        return (
                          <li
                            key={oi}
                            className={cn(
                              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
                              isCorrect
                                ? 'bg-green-500/10 text-green-200'
                                : isMine
                                  ? 'bg-red-500/10 text-red-200'
                                  : 'text-slate-400'
                            )}
                          >
                            <span className="font-mono text-xs text-slate-500">{LETTERS[oi]}</span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && <Check className="h-4 w-4 shrink-0 text-green-400" />}
                            {isMine && !isCorrect && <X className="h-4 w-4 shrink-0 text-red-400" />}
                          </li>
                        );
                      })}
                    </ul>
                    {q.explanation && (
                      <p className="mt-3 rounded-lg bg-navy-800/70 px-3 py-2.5 text-xs leading-relaxed text-slate-300">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
