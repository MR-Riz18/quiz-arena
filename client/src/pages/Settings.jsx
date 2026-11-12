import { useState } from 'react';
import { Settings as SettingsIcon, Loader2, KeyRound, Bell, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { authApi, playerApi } from '../api/index.js';
import Avatar from '../components/Avatar.jsx';
import { cn } from '../utils/cn.js';

const AVATAR_PRESETS = ['default', 'violet', 'blue', 'teal', 'amber', 'rose', 'emerald', 'indigo'];

function loadPrefs() {
  try {
    return { sounds: true, toasts: true, ...JSON.parse(localStorage.getItem('qa-prefs') || '{}') };
  } catch {
    return { sounds: true, toasts: true };
  }
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-navy-800/60 px-4 py-3 text-left transition hover:bg-navy-800"
      role="switch"
      aria-checked={checked}
    >
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <span
        className={cn(
          'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition',
          checked ? 'bg-brand-blue' : 'bg-navy-600'
        )}
      >
        <span className={cn('h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0')} />
      </span>
    </button>
  );
}

export default function Settings() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState(user.username);
  const [avatar, setAvatar] = useState(user.avatar || 'default');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [prefs, setPrefs] = useState(loadPrefs);

  const savePrefs = (next) => {
    setPrefs(next);
    localStorage.setItem('qa-prefs', JSON.stringify(next));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    const name = username.trim();
    if (name.length < 3 || name.length > 20 || !/^[A-Za-z0-9_]+$/.test(name)) {
      setProfileError('Username must be 3-20 characters: letters, numbers, underscores.');
      return;
    }
    setProfileBusy(true);
    try {
      await playerApi.updateMe({ username: name, avatar });
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      setProfileError(err.message || 'Could not update profile');
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (!currentPassword || newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    setPwBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwError(err.message || 'Could not change password');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="page-title mb-6 flex items-center gap-2">
        <SettingsIcon className="h-7 w-7 text-brand-blue" /> Settings
      </h1>

      {/* Profile */}
      <form onSubmit={saveProfile} className="card-pad mb-4">
        <h2 className="mb-4 font-bold text-white">Profile</h2>
        <div className="mb-4 flex items-center gap-4">
          <Avatar username={username.trim() || user.username} avatar={avatar} size="xl" />
          <div className="flex-1">
            <label className="label" htmlFor="set-username">Username</label>
            <input
              id="set-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
            />
          </div>
        </div>
        <p className="label">Avatar</p>
        <div className="mb-4 grid grid-cols-8 gap-2">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAvatar(preset)}
              className={cn(
                'rounded-full p-0.5 ring-2 ring-offset-2 ring-offset-navy-900 transition',
                avatar === preset ? 'ring-brand-blue' : 'ring-transparent hover:ring-navy-600'
              )}
              title={preset}
              aria-label={`Avatar ${preset}`}
            >
              <Avatar username={username.trim() || user.username} avatar={preset} size="md" className="!h-10 !w-10" />
            </button>
          ))}
        </div>
        {profileError && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{profileError}</p>}
        <button type="submit" className="btn-primary" disabled={profileBusy}>
          {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save profile
        </button>
      </form>

      {/* Password */}
      <form onSubmit={changePassword} className="card-pad mb-4">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
          <KeyRound className="h-5 w-5 text-slate-400" /> Change password
        </h2>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="set-cur">Current password</label>
            <input
              id="set-cur" type="password" className="input" value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="set-new">New password</label>
            <input
              id="set-new" type="password" className="input" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          {pwError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{pwError}</p>}
          <button type="submit" className="btn-secondary" disabled={pwBusy}>
            {pwBusy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </div>
      </form>

      {/* Notifications */}
      <div className="card-pad">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
          <Bell className="h-5 w-5 text-slate-400" /> Notifications
        </h2>
        <div className="space-y-2">
          <Toggle
            checked={prefs.toasts}
            onChange={(v) => savePrefs({ ...prefs, toasts: v })}
            label="Toast notifications"
            hint="Match invites, rating updates and match events. Errors always show."
          />
          <Toggle
            checked={prefs.sounds}
            onChange={(v) => savePrefs({ ...prefs, sounds: v })}
            label="Sound effects"
            hint="Stored for now — in-game sounds are coming soon."
          />
        </div>
        <p className="muted mt-3 text-xs">Preferences are stored on this device only.</p>
      </div>
    </div>
  );
}
