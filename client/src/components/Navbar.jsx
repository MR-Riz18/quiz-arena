import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Zap, LayoutDashboard, Users, LogOut, User as UserIcon, Menu, X, Trophy, History, UserPlus, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';
import InviteBell from './InviteBell.jsx';
import { cn } from '../utils/cn.js';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const { connected } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      toast.error(e.message || 'Logout failed');
    }
  };

  const linkClass = ({ isActive }) =>
    cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
      isActive
        ? 'bg-gradient-to-r from-brand-blue/20 to-brand-violet/20 text-white ring-1 ring-brand-blue/30'
        : 'text-slate-400 hover:bg-navy-800 hover:text-white'
    );

  return (
    <header className="sticky top-0 z-40 border-b border-navy-700 bg-navy-950/90 shadow-lg shadow-black/20 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-violet shadow-lg shadow-brand-violet/30">
            <Zap className="h-5 w-5 text-navy-950" fill="currentColor" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white">
            Quiz<span className="text-brand-blue">Arena</span>
          </span>
        </Link>

        {user && (
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" className={linkClass}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </NavLink>
            <NavLink to="/rooms" className={linkClass}>
              <Users className="h-4 w-4" /> Rooms
            </NavLink>
            <NavLink to="/leaderboard" className={linkClass}>
              <Trophy className="h-4 w-4" /> Leaderboard
            </NavLink>
            <NavLink to="/history" className={linkClass}>
              <History className="h-4 w-4" /> History
            </NavLink>
            <NavLink to="/friends" className={linkClass}>
              <UserPlus className="h-4 w-4" /> Friends
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={linkClass}>
                <ShieldCheck className="h-4 w-4" /> Admin
              </NavLink>
            )}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user && (
            <span
              className="hidden items-center gap-1.5 rounded-full bg-navy-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 sm:inline-flex"
              title={connected ? 'Live connection active' : 'Reconnecting…'}
            >
              <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-green-400' : 'bg-amber-400 animate-pulse')} />
              {connected ? 'Live' : 'Connecting'}
            </span>
          )}

          {user && <InviteBell />}

          {user ? (
            <>
              <button
                className="md:hidden rounded-lg p-2 text-slate-300 hover:bg-navy-800"
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="relative hidden md:block">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-xl border border-navy-700 bg-navy-800 px-2 py-1.5 pr-3 transition hover:border-brand-blue/50"
                >
                  <Avatar username={user.username} avatar={user.avatar} size="sm" />
                  <span className="max-w-[120px] truncate text-sm font-semibold text-white">{user.username}</span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-navy-700 bg-navy-900 shadow-2xl">
                      <button
                        onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-navy-800"
                      >
                        <UserIcon className="h-4 w-4" /> Profile
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-navy-800"
                      >
                        <SettingsIcon className="h-4 w-4" /> Settings
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-navy-800"
                        >
                          <ShieldCheck className="h-4 w-4" /> Admin
                        </button>
                      )}
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-300 hover:bg-navy-800"
                      >
                        <LogOut className="h-4 w-4" /> Log out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="text-sm font-semibold text-slate-300 hover:text-white">
                Log in
              </Link>
              <Link to="/register" className="btn-primary !px-4 !py-2 text-sm">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      {user && open && (
        <nav className="border-t border-navy-800 px-4 py-3 md:hidden">
          <div className="grid gap-1">
            <NavLink to="/dashboard" className={linkClass} onClick={() => setOpen(false)}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </NavLink>
            <NavLink to="/rooms" className={linkClass} onClick={() => setOpen(false)}>
              <Users className="h-4 w-4" /> Rooms
            </NavLink>
            <NavLink to="/leaderboard" className={linkClass} onClick={() => setOpen(false)}>
              <Trophy className="h-4 w-4" /> Leaderboard
            </NavLink>
            <NavLink to="/history" className={linkClass} onClick={() => setOpen(false)}>
              <History className="h-4 w-4" /> History
            </NavLink>
            <NavLink to="/profile" className={linkClass} onClick={() => setOpen(false)}>
              <UserIcon className="h-4 w-4" /> Profile
            </NavLink>
            <NavLink to="/friends" className={linkClass} onClick={() => setOpen(false)}>
              <UserPlus className="h-4 w-4" /> Friends
            </NavLink>
            <NavLink to="/settings" className={linkClass} onClick={() => setOpen(false)}>
              <SettingsIcon className="h-4 w-4" /> Settings
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
                <ShieldCheck className="h-4 w-4" /> Admin
              </NavLink>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-300 hover:bg-navy-800"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
