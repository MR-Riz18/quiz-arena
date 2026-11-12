import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, Hash, Trophy, Swords, Target, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { roomApi } from '../api/index.js';
import Avatar from '../components/Avatar.jsx';
import StatCard from '../components/StatCard.jsx';
import TierBadge from '../components/TierBadge.jsx';
import QuickMatchModal from '../components/QuickMatchModal.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [quickMatchOpen, setQuickMatchOpen] = useState(false);

  const stats = user?.stats || {};
  const winRate = stats.matchesPlayed
    ? `${Math.round((stats.wins / stats.matchesPlayed) * 100)}%`
    : '—';

  const joinByCode = async (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setJoining(true);
    try {
      await roomApi.join(clean);
      navigate(`/room/${clean}`);
    } catch (err) {
      toast.error(err.message || 'Could not join room');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Greeting */}
      <div className="card-pad relative mb-6 flex flex-col gap-4 overflow-hidden animate-fade-slide-in sm:flex-row sm:items-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-blue via-brand-violet to-brand-blue" />
        <Avatar username={user.username} avatar={user.avatar} size="xl" />
        <div className="flex-1">
          <h1 className="page-title">Welcome back, {user.username}</h1>
          <p className="muted mt-1">
            Rating <span className="font-bold text-brand-blue">{user.rating ?? 1000}</span>
            {' · '}
            <TierBadge tier={user.tier || 'Bronze'} size="sm" />
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setQuickMatchOpen(true)} className="btn-primary">
            <Swords className="h-5 w-5" /> Quick Match
          </button>
          <Link to="/rooms/new" className="btn-secondary"><Plus className="h-5 w-5" /> Create Room</Link>
          <Link to="/rooms" className="btn-secondary"><Users className="h-5 w-5" /> Browse Rooms</Link>
        </div>
      </div>
      <QuickMatchModal open={quickMatchOpen} onClose={() => setQuickMatchOpen(false)} />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Matches played" value={stats.matchesPlayed ?? 0} icon={Swords} accent="text-brand-blue" />
        <StatCard label="Wins" value={stats.wins ?? 0} icon={Trophy} accent="text-amber-400" />
        <StatCard label="Win rate" value={winRate} icon={Target} accent="text-emerald-400" />
        <StatCard label="Rating" value={user.rating ?? 1000} icon={Zap} accent="text-brand-violet" sub={`${user.tier || 'Bronze'} tier`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Join with code */}
        <div className="card-pad">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-white"><Hash className="h-5 w-5 text-brand-blue" /> Join with a code</h2>
          <p className="muted mb-4">Got a private room code from a friend? Drop it here.</p>
          <form onSubmit={joinByCode} className="flex gap-2">
            <input
              className="input uppercase tracking-[0.2em] text-center font-mono"
              placeholder="ABC123"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button type="submit" className="btn-primary shrink-0" disabled={joining || !code.trim()}>
              Join
            </button>
          </form>
        </div>

        {/* How scoring works */}
        <div className="card-pad">
          <h2 className="mb-3 font-bold text-white">How scoring works</h2>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><span className="font-semibold text-white">1,000</span> base points per correct answer</li>
            <li>Up to <span className="font-semibold text-brand-blue">+500 speed bonus</span> — faster answers score more</li>
            <li>Up to <span className="font-semibold text-orange-400">+500 streak bonus</span> — chain correct answers</li>
            <li>Wrong answers score <span className="font-semibold text-red-400">0</span> and reset your streak</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
