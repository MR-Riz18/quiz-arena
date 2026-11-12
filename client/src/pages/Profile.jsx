import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Trophy, Target, Crosshair, Timer, Tag, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { playerApi } from '../api/index.js';
import Avatar from '../components/Avatar.jsx';
import StatCard from '../components/StatCard.jsx';
import TierBadge, { nextTierInfo } from '../components/TierBadge.jsx';
import RatingDelta from '../components/RatingDelta.jsx';
import { CardSkeleton } from '../components/StateViews.jsx';
import { pct, formatSeconds, formatTimeAgo } from '../utils/format.js';

// Tiny SVG sparkline of recent rated matches (oldest -> newest).
function RatingSparkline({ points }) {
  if (!points || points.length < 2) {
    return <p className="muted py-6 text-center text-sm">Play a rated match to start your rating history.</p>;
  }
  const w = 280;
  const h = 64;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const stepX = w / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, h - 8 - ((p - min) / span) * (h - 16)]);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const up = points[points.length - 1] >= points[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Rating history">
      <polygon points={area} fill={up ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)'} />
      <polyline
        points={line}
        fill="none"
        stroke={up ? '#34d399' : '#f87171'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r="4"
        fill={up ? '#34d399' : '#f87171'}
      />
    </svg>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [sparkPoints, setSparkPoints] = useState([]);

  const stats = user?.stats || {};

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await playerApi.profile(user.username);
        if (alive) setProfile(p);
      } catch {
        /* enriched stats are optional */
      }
      try {
        const { matches } = await playerApi.myMatches({ limit: 20 });
        if (!alive) return;
        const rated = (matches || []).filter((m) => m.ratingDelta != null);
        const pts = [user.rating ?? 1000];
        let running = user.rating ?? 1000;
        for (const m of rated) {
          running -= m.ratingDelta;
          pts.push(running);
        }
        setSparkPoints(pts.reverse());
      } catch {
        /* sparkline optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.username, user.rating]);

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const tierInfo = useMemo(
    () => nextTierInfo(user.tier || 'Bronze', user.rating ?? 1000),
    [user.tier, user.rating]
  );
  const accuracy = stats.totalAnswers
    ? Math.round(((stats.correctAnswers || 0) / stats.totalAnswers) * 100)
    : null;
  const avgResponse = stats.totalAnswers ? Math.round((stats.totalResponseMs || 0) / stats.totalAnswers) : null;
  const bestCategory = profile?.favoriteCategories?.[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="card-pad mb-4 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <Avatar username={user.username} avatar={user.avatar} size="xl" />
        <div className="flex-1">
          <h1 className="page-title">{user.username}</h1>
          <p className="muted">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="text-lg font-extrabold tabular-nums text-brand-blue">{user.rating ?? 1000}</span>
            <TierBadge tier={user.tier || 'Bronze'} />
          </div>
          {tierInfo ? (
            <div className="mt-2 max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-navy-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-violet transition-all"
                  style={{ width: `${Math.round(tierInfo.progress * 100)}%` }}
                />
              </div>
              <p className="muted mt-1 text-[11px]">
                {tierInfo.needed} rating to <span className="font-bold text-white">{tierInfo.next}</span>
              </p>
            </div>
          ) : (
            <p className="muted mt-1 text-[11px]">Highest tier reached — the arena fears you.</p>
          )}
        </div>
        <button onClick={doLogout} className="btn-danger !py-2 text-sm">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Wins" value={stats.wins ?? 0} icon={Trophy} accent="text-amber-400" />
        <StatCard label="Win rate" value={pct(stats.wins ?? 0, stats.matchesPlayed ?? 0)} icon={Target} accent="text-emerald-400" />
        <StatCard label="Accuracy" value={accuracy != null ? `${accuracy}%` : '—'} icon={Crosshair} accent="text-brand-blue" />
        <StatCard
          label="Avg. response"
          value={avgResponse != null ? formatSeconds(avgResponse) : '—'}
          icon={Timer}
          accent="text-brand-violet"
        />
      </div>

      {/* Rating history + best category */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="card-pad">
          <h2 className="mb-2 font-bold text-white">Rating trend</h2>
          <RatingSparkline points={sparkPoints} />
        </div>
        <div className="card-pad">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-white">
            <Tag className="h-4 w-4 text-brand-blue" /> Best category
          </h2>
          {bestCategory ? (
            <>
              <p className="text-2xl font-extrabold text-white">{bestCategory.name}</p>
              <p className="muted mt-1 text-sm">
                {bestCategory.matches} match{bestCategory.matches === 1 ? '' : 'es'} played
              </p>
            </>
          ) : (
            <p className="muted py-4 text-center text-sm">No completed matches yet.</p>
          )}
          <h2 className="mb-2 mt-4 font-bold text-white">Recent battles</h2>
          {!profile ? (
            <CardSkeleton />
          ) : profile.recentMatches.length === 0 ? (
            <p className="muted text-sm">Nothing here yet — go fight.</p>
          ) : (
            <ul className="space-y-2">
              {profile.recentMatches.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/match/${m.id}/results`}
                    className="flex items-center gap-2 rounded-lg bg-navy-800/60 px-3 py-2 text-sm transition hover:bg-navy-800"
                  >
                    <span className={m.result === 'win' ? 'font-bold text-green-400' : 'font-bold text-red-400'}>
                      {m.result === 'win' ? 'W' : 'L'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-300">
                      vs {m.opponents.length ? m.opponents.map((o) => o.username).join(', ') : '—'}
                    </span>
                    <RatingDelta delta={m.ratingDelta} size="sm" />
                    <span className="muted text-[11px]">{formatTimeAgo(m.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Account settings live under /settings now */}
      <Link
        to="/settings"
        className="card-pad flex items-center gap-3 transition hover:border-brand-blue/40"
      >
        <SettingsIcon className="h-5 w-5 text-brand-blue" />
        <span className="flex-1">
          <span className="block font-bold text-white">Account settings</span>
          <span className="muted block text-sm">Edit username and avatar, change password, notification preferences.</span>
        </span>
      </Link>

      <p className="mt-4 text-center text-xs text-slate-600">
        Member since {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
      </p>
    </div>
  );
}
