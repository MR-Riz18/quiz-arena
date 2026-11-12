import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Register() {
  const { register, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) {
      setError('Username must be 3–20 characters: letters, numbers, underscores.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await register(username.trim(), email.trim(), password);
      toast.success('Account created — welcome to the arena!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <div className="card-pad w-full animate-fade-slide-in">
        <h1 className="page-title mb-1">Create account</h1>
        <p className="muted mb-6">Join the arena in under a minute.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username" className="input" value={username}
              onChange={(e) => setUsername(e.target.value)} placeholder="quiz_wizard" autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email" type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password"
            />
          </div>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
            Create account
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-400">
          Already have one? <Link to="/login" className="font-semibold text-brand-blue hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
