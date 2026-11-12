import { Link } from 'react-router-dom';
import { Zap, Users, Timer, Trophy, Swords, UserPlus, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { categoryApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { CardSkeleton } from '../components/StateViews.jsx';

const STEPS = [
  {
    icon: UserPlus,
    title: '1. Create or join a room',
    text: 'Start a private room and share the 6-letter code with friends, or jump into a public lobby.',
  },
  {
    icon: Timer,
    title: '2. Answer against the clock',
    text: 'Questions drop for everyone at the same instant. Faster correct answers earn bigger speed bonuses.',
  },
  {
    icon: Trophy,
    title: '3. Top the live leaderboard',
    text: 'Watch scores update in real time as every player locks in. Streaks multiply your points.',
  },
];

export default function Landing() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    categoryApi
      .list()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.18),transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl animate-fade-slide-in px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-violet/40 bg-brand-violet/10 px-4 py-1.5 text-xs font-semibold text-brand-blue">
            <Zap className="h-3.5 w-3.5" /> Real-time multiplayer trivia
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
            Think Fast. Play Smart.{' '}
            <span className="bg-gradient-to-r from-brand-blue to-brand-violet bg-clip-text text-transparent">
              Win Together.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-400 sm:text-lg">
            Battle friends and rivals in live quiz rooms. Same questions, same clock, instant
            leaderboard — may the fastest brain win.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {user ? (
              <Link to="/dashboard" className="btn-primary w-full sm:w-auto">
                <Play className="h-5 w-5" /> Enter the arena
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary w-full sm:w-auto">
                  <Swords className="h-5 w-5" /> Start Playing
                </Link>
                <Link to="/login" className="btn-secondary w-full sm:w-auto">
                  <Users className="h-5 w-5" /> Play with Friends
                </Link>
              </>
            )}
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Timer className="h-4 w-4 text-brand-blue" /> Live timers</span>
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-violet" /> 2–8 players</span>
            <span className="flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-400" /> Live leaderboard</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <span className="eyebrow">How it works</span>
        <h2 className="mb-8 text-center text-2xl font-extrabold text-white sm:text-3xl">Three steps to the arena</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="card-pad card-hover">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue/20 to-brand-violet/20">
                <s.icon className="h-5 w-5 text-brand-blue" />
              </div>
              <h3 className="mb-1.5 font-bold text-white">{s.title}</h3>
              <p className="text-sm text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <span className="eyebrow">Battle arenas</span>
        <h2 className="mb-2 text-center text-2xl font-extrabold text-white sm:text-3xl">Pick your battlefield</h2>
        <p className="mb-8 text-center text-sm text-slate-400">Choose a category — or go Mixed for everything.</p>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {categories.map((c) => (
              <div key={c._id || c.id || c.name} className="card-pad card-hover !p-5 text-center">
                <p className="font-bold text-white">{c.name}</p>
                {c.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{c.description}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">Categories are loading — check back in a moment.</p>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-navy-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue to-brand-violet">
              <Zap className="h-4 w-4 text-navy-950" fill="currentColor" />
            </span>
            <span className="text-sm font-bold text-white">QuizArena</span>
          </div>
          <p className="text-xs text-slate-500">Real-time multiplayer quiz battles. Play fair, play fast.</p>
        </div>
      </footer>
    </div>
  );
}
