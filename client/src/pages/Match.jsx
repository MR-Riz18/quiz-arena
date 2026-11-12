import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, WifiOff, Flag, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import TimerBar from '../components/TimerBar.jsx';
import QuestionCard from '../components/QuestionCard.jsx';
import LeaderboardPanel from '../components/LeaderboardPanel.jsx';
import { ErrorState, CardSkeleton } from '../components/StateViews.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { formatNumber } from '../utils/format.js';

// The battle screen. The server is authoritative: it decides the question
// sequence, deadlines, correctness and scores. This page only renders what the
// server sends and submits the player's single answer per question.
//
// Phase 2: floating points feedback, streak flame, reconnect overlay with
// "you're back in" toast, next-question progress bar, abandonment badges,
// and forfeit-via-room:leave (immediate abandon, no grace).
export default function Match() {
  const { matchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscribe, emit, setActiveMatch, clearActiveMatch, connected } = useSocket();
  const { toast } = useToast();

  const [phase, setPhase] = useState('loading'); // loading | battle | cancelled | error
  const [cancelReason, setCancelReason] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [question, setQuestion] = useState(null); // {questionId, text, options[4], difficulty, deadline}
  const [locked, setLocked] = useState(false);
  const [myPick, setMyPick] = useState(null);
  const [reveal, setReveal] = useState(null); // {correctIndex, explanation, points}
  const [leaderboard, setLeaderboard] = useState([]);
  const [scores, setScores] = useState({});
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [floatGain, setFloatGain] = useState(null); // {points, key} — "+1,250" pop
  const [between, setBetween] = useState(false); // 4s pause between questions
  const [reconnecting, setReconnecting] = useState(false);
  const [roomCode, setRoomCode] = useState(location.state?.roomCode || null);
  const myId = String(user?.id || user?._id || '');
  const reconnectArmed = useRef(false);

  // ---- reconnect overlay ----------------------------------------------------
  // Show a full-screen overlay only when the socket drops mid-battle (not on
  // first load). When the snapshot lands after rejoin, toast the resume point.
  useEffect(() => {
    if (!connected && phase === 'battle') {
      reconnectArmed.current = true;
      setReconnecting(true);
    }
  }, [connected, phase]);

  const applySnapshot = useCallback(
    (snap) => {
      if (!snap || snap.matchId !== matchId) return;
      if (snap.state === 'completed') {
        navigate(`/match/${matchId}/results`, { replace: true });
        return;
      }
      if (snap.state === 'cancelled') {
        setPhase('cancelled');
        setCancelReason(snap.reason || 'The match was cancelled.');
        return;
      }
      if (snap.roomCode) setRoomCode(snap.roomCode);
      setTotalQuestions(snap.totalQuestions || 0);
      if (snap.scores) setScores(snap.scores);
      if (snap.leaderboard) setLeaderboard(snap.leaderboard);
      const cq = snap.currentQuestion;
      if (cq) {
        // currentQuestion carries remainingMs + alreadyAnswered (no deadline, no answer).
        const deadline = Date.now() + Math.max(0, cq.remainingMs ?? 0);
        setQuestion({
          questionId: cq.questionId,
          text: cq.text,
          options: cq.options || [],
          difficulty: cq.difficulty,
          deadline,
          totalMs: cq.totalMs,
        });
        setQuestionIndex(cq.questionIndex ?? snap.questionIndex ?? 0);
        setLocked(!!cq.alreadyAnswered || (cq.remainingMs ?? 0) <= 0);
        setMyPick(null);
        setReveal(null);
        setBetween(false);
      }
      if (snap.lastReveal) {
        setReveal({
          correctIndex: snap.lastReveal.correctIndex,
          explanation: snap.lastReveal.explanation,
          myPick: null,
        });
        setLocked(true);
        setBetween(true);
      }
      setPhase('battle');

      // Reconnect landed: tell the player exactly where they resumed.
      if (reconnectArmed.current) {
        reconnectArmed.current = false;
        setReconnecting(false);
        if (cq && (cq.remainingMs ?? 0) > 0) {
          toast.success(
            `You're back in — Q${(cq.questionIndex ?? 0) + 1}, ${Math.ceil(cq.remainingMs / 1000)}s left`
          );
        } else {
          toast.success("You're back in the match");
        }
      }
    },
    [matchId, navigate, toast]
  );

  // ---- socket wiring -------------------------------------------------------
  useEffect(() => {
    // (Re)register this match as active and ask the server for a snapshot.
    // Works for a fresh start (engine live state) and for refresh/reconnect.
    setActiveMatch(matchId, location.state?.roomCode);

    const unsubs = [
      subscribe('match:snapshot', applySnapshot),

      subscribe('question:started', (q) => {
        if (q.matchId !== matchId) return;
        setQuestion(q);
        setQuestionIndex(q.questionIndex);
        setTotalQuestions(q.totalQuestions);
        setLocked(false);
        setMyPick(null);
        setReveal(null);
        setBetween(false);
        setPhase('battle');
      }),

      subscribe('answer:received', (ack) => {
        if (!ack) return;
        if (ack.accepted) {
          setLocked(true);
          // Floating "+points" feedback near the score.
          if (ack.points > 0) {
            const key = Date.now();
            setFloatGain({ points: ack.points, key });
            setTimeout(() => {
              setFloatGain((cur) => (cur && cur.key === key ? null : cur));
            }, 1300);
          }
        } else {
          setLocked(false);
          setMyPick(null);
          toast.error(ack.reason || 'Answer not accepted');
        }
      }),

      subscribe('score:updated', ({ matchId: mid, scores: s }) => {
        if (mid !== matchId || !s) return;
        setScores(s);
      }),

      subscribe('leaderboard:updated', ({ matchId: mid, leaderboard: lb }) => {
        if (mid !== matchId || !lb) return;
        setLeaderboard(lb);
      }),

      subscribe('question:ended', (r) => {
        if (r.matchId !== matchId) return;
        setReveal({ correctIndex: r.correctIndex, explanation: r.explanation, myPick });
        setLocked(true);
        setBetween(true); // 4s server pause -> "next question" bar
        if (r.scores) setScores(r.scores);
        if (r.leaderboard) setLeaderboard(r.leaderboard);
      }),

      subscribe('match:completed', ({ matchId: mid }) => {
        if (mid !== matchId) return;
        clearActiveMatch();
        navigate(`/match/${matchId}/results`, { replace: true });
      }),

      subscribe('match:cancelled', ({ matchId: mid, reason }) => {
        if (mid !== matchId) return;
        clearActiveMatch();
        setPhase('cancelled');
        setCancelReason(reason || 'The match was cancelled.');
      }),

      subscribe('player:disconnected', ({ userId, username }) => {
        setLeaderboard((prev) =>
          prev.map((e) =>
            String(e.userId) === String(userId) ? { ...e, connected: false } : e
          )
        );
        if (username) toast.info(`${username} disconnected — 60s to reconnect`);
      }),

      subscribe('player:reconnected', ({ userId, username }) => {
        setLeaderboard((prev) =>
          prev.map((e) =>
            String(e.userId) === String(userId) ? { ...e, connected: true } : e
          )
        );
        if (username) toast.success(`${username} reconnected`);
      }),

      subscribe('player:abandoned', ({ userId, username }) => {
        setLeaderboard((prev) =>
          prev.map((e) =>
            String(e.userId) === String(userId)
              ? { ...e, connected: false, abandoned: true }
              : e
          )
        );
        if (username) toast.info(`${username} abandoned the match`);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
      clearActiveMatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ---- answer submit (one shot) ---------------------------------------------
  const submit = useCallback(
    (idx) => {
      if (locked || !question || phase !== 'battle') return;
      setMyPick(idx);
      setLocked(true); // optimistic lock; server ack confirms (duplicates are ignored server-side)
      emit('answer:submit', { matchId, optionIndex: idx });
    },
    [locked, question, phase, emit, matchId]
  );

  // ---- forfeit: intentional leave mid-match = immediate abandon --------------
  const forfeit = useCallback(() => {
    if (roomCode) emit('room:leave', { code: roomCode });
    clearActiveMatch();
    setConfirmQuit(false);
    navigate('/dashboard');
  }, [roomCode, emit, clearActiveMatch, navigate]);

  const myScore = scores[myId] ?? 0;
  const myEntry = leaderboard.find((e) => String(e.userId) === myId);
  const myStreak = myEntry?.streak ?? 0;

  if (phase === 'loading') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <CardSkeleton />
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Syncing with the arena…
        </p>
      </div>
    );
  }

  if (phase === 'cancelled') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <ErrorState message={cancelReason} onRetry={() => navigate('/rooms')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Full-screen reconnect overlay (mid-battle drops only) */}
      {reconnecting && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-navy-950/85 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-brand-blue" />
          <p className="mt-4 text-lg font-bold text-white">Reconnecting…</p>
          <p className="mt-1 max-w-xs text-center text-sm text-slate-400">
            Your spot is held for 60 seconds. Your answers so far are safe.
          </p>
        </div>
      )}

      {!connected && !reconnecting && (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <WifiOff className="h-4 w-4" /> Connection lost — reconnecting… your answers are safe.
        </div>
      )}

      {/* Top bar */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span className="rounded-lg bg-navy-700 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-200">
          Q {Math.min(questionIndex + 1, totalQuestions || 1)}/{totalQuestions || '…'}
        </span>
        <div className="min-w-[160px] flex-1">
          {question?.deadline ? (
            <TimerBar
              deadline={question.deadline}
              totalMs={question.totalMs}
              onExpire={() => setLocked(true)}
            />
          ) : (
            <div className="h-2.5 w-full rounded-full bg-navy-700" />
          )}
        </div>
        {myStreak >= 2 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-orange-500/15 px-2.5 py-1 text-sm font-extrabold text-orange-400">
            <Flame className="h-4 w-4" /> {myStreak}
          </span>
        )}
        <span className="relative rounded-lg bg-brand-violet/15 px-3 py-1 text-sm font-extrabold tabular-nums text-brand-violet">
          {formatNumber(myScore)} pts
          {floatGain && (
            <span
              key={floatGain.key}
              className="animate-float-up pointer-events-none absolute -top-1 right-1 font-black text-green-400"
            >
              +{formatNumber(floatGain.points)}
            </span>
          )}
        </span>
        <button
          onClick={() => setConfirmQuit(true)}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-navy-800 hover:text-red-300"
          title="Forfeit match"
        >
          <Flag className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {question ? (
            <QuestionCard
              text={question.text}
              options={question.options}
              selectedIndex={myPick}
              locked={locked}
              reveal={reveal ? { correctIndex: reveal.correctIndex, myPick } : null}
              onSelect={submit}
              difficulty={question.difficulty}
            />
          ) : (
            <CardSkeleton />
          )}

          {/* Reveal panel: explanation + next-question progress */}
          {reveal && (
            <div className="card-pad mt-4 animate-reveal-pop">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="mb-1 font-bold text-white">Explanation</h3>
                  <p className="text-sm leading-relaxed text-slate-300">
                    {reveal.explanation || 'No explanation available for this question.'}
                  </p>
                </div>
              </div>
              {between && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Next question incoming</span>
                    <span className="tabular-nums">Q{Math.min(questionIndex + 2, totalQuestions || 0)}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-navy-700">
                    <div
                      key={questionIndex}
                      className="animate-next-bar h-full origin-left rounded-full bg-gradient-to-r from-brand-blue to-brand-violet"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <LeaderboardPanel entries={leaderboard} selfId={myId} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmQuit}
        title="Forfeit this match?"
        message="You'll abandon the match immediately. Your opponents keep playing."
        confirmLabel="Forfeit"
        onConfirm={forfeit}
        onCancel={() => setConfirmQuit(false)}
      />
    </div>
  );
}
