import { useEffect, useState, Fragment } from 'react';
import {
  LayoutDashboard, Users, HelpCircle, Tags, Swords, ScrollText, Loader2,
  Search, Pencil, Trash2, Plus, ShieldCheck, ShieldAlert, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { adminApi, categoryApi } from '../api/index.js';
import StatCard from '../components/StatCard.jsx';
import Avatar from '../components/Avatar.jsx';
import TierBadge from '../components/TierBadge.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { CardSkeleton, EmptyState } from '../components/StateViews.jsx';
import { formatTimeAgo, formatSeconds } from '../utils/format.js';
import { cn } from '../utils/cn.js';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const TABS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'questions', label: 'Questions', icon: HelpCircle },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'matches', label: 'Matches', icon: Swords },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MATCH_STATUSES = ['waiting', 'countdown', 'inProgress', 'questionEnded', 'completed', 'cancelled'];

const chartTheme = {
  tick: { fill: '#94a3b8', fontSize: 11 },
  grid: '#1e293b',
  tooltip: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#fff',
    fontSize: 12,
  },
};

function shortDate(iso) {
  return iso ? iso.slice(5) : ''; // MM-DD
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
function OverviewTab() {
  const { toast } = useToast();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setStats(await adminApi.stats());
      } catch (e) {
        toast.error(e.message || 'Could not load stats');
      }
    })();
  }, [toast]);

  if (!stats) return <CardSkeleton />;

  const activity = (stats.signupsPerDay || []).map((d, i) => ({
    day: shortDate(d.date),
    signups: d.count,
    matches: (stats.matchesPerDay || [])[i]?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Registered users" value={stats.totalUsers ?? 0} icon={Users} accent="text-brand-blue" />
        <StatCard label="Live matches" value={stats.activeMatches ?? 0} icon={Swords} accent="text-green-400" />
        <StatCard label="Completed matches" value={stats.completedMatches ?? 0} icon={ShieldCheck} accent="text-brand-violet" />
        <StatCard label="Questions" value={stats.totalQuestions ?? 0} icon={HelpCircle} accent="text-amber-400" />
        <StatCard label="Avg. match length" value={`${stats.avgMatchDurationMin ?? 0} min`} icon={Swords} accent="text-teal-400" />
        <StatCard label="Matchmaking queue" value={stats.matchmaking?.queuedNow ?? 0} icon={Users} accent="text-rose-400" />
      </div>

      <div className="card-pad">
        <h3 className="mb-4 font-bold text-white">Activity — last 7 days</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activity} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={chartTheme.tick} />
              <YAxis tick={chartTheme.tick} allowDecimals={false} />
              <Tooltip contentStyle={chartTheme.tooltip} />
              <Line type="monotone" dataKey="signups" name="Signups" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="matches" name="Matches" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-pad">
        <h3 className="mb-4 font-bold text-white">Popular categories</h3>
        {(stats.popularCategories || []).length === 0 ? (
          <EmptyState title="No data yet" hint="Category stats appear after matches complete." />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.popularCategories} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={chartTheme.tick} interval={0} angle={-12} dy={8} height={44} />
                <YAxis tick={chartTheme.tick} allowDecimals={false} />
                <Tooltip contentStyle={chartTheme.tooltip} />
                <Bar dataKey="matches" name="Matches" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------
function UsersTab() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);

  const load = async (q = search) => {
    try {
      const { users: rows } = await adminApi.users({ search: q });
      setUsers(rows);
    } catch (e) {
      toast.error(e.message || 'Could not load users');
      setUsers([]);
    }
  };

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (u, body) => {
    setBusy(u.id);
    try {
      const updated = await adminApi.updateUser(u.id, body);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
      toast.success('User updated');
    } catch (e) {
      toast.error(e.message || 'Could not update user');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card-pad">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input !pl-9"
            placeholder="Search username or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <button onClick={() => load()} className="btn-secondary">Search</button>
      </div>

      {users === null ? (
        <CardSkeleton />
      ) : users.length === 0 ? (
        <EmptyState title="No users" hint="Nobody matches that search." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me.id;
                const disabled = busy === u.id || isSelf;
                return (
                  <tr key={u.id} className="border-t border-navy-800">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar username={u.username} avatar={u.avatar} size="sm" />
                        <span className="font-semibold text-white">{u.username}</span>
                        {isSelf && <span className="text-[11px] text-slate-500">(you)</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{u.email}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-brand-blue">{u.rating}</span>
                      <TierBadge tier={u.tier} />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        className="input !w-auto !py-1.5 text-xs"
                        value={u.role}
                        disabled={disabled}
                        title={isSelf ? 'You cannot change your own role' : 'Change role'}
                        onChange={(e) => patch(u, { role: e.target.value })}
                      >
                        <option value="player">player</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        disabled={disabled}
                        title={isSelf ? 'You cannot deactivate yourself' : u.isActive ? 'Suspend account' : 'Reactivate account'}
                        onClick={() => patch(u, { isActive: !u.isActive })}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition',
                          u.isActive ? 'bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-300'
                            : 'bg-red-500/15 text-red-300 hover:bg-green-500/15 hover:text-green-400',
                          disabled && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        {u.isActive ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                        {u.isActive ? 'Active' : 'Suspended'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{formatTimeAgo(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questions tab
// ---------------------------------------------------------------------------
const EMPTY_Q = { text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', category: '', difficulty: 'medium', isActive: true };

function QuestionModal({ initial, categories, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({ ...EMPTY_Q, ...initial }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setOption = (i, v) =>
    setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

  const save = async () => {
    setError('');
    if (!form.text.trim()) return setError('Question text is required.');
    if (form.options.some((o) => !o.trim())) return setError('All four options are required.');
    if (!form.category) return setError('Pick a category.');
    setBusy(true);
    try {
      const payload = { ...form, text: form.text.trim(), options: form.options.map((o) => o.trim()) };
      if (initial?.id) await adminApi.updateQuestion(initial.id, payload);
      else await adminApi.createQuestion(payload);
      toast.success(initial?.id ? 'Question updated' : 'Question created');
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save question');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card-pad max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2 className="mb-4 text-lg font-extrabold text-white">{initial?.id ? 'Edit question' : 'New question'}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="label">Question text</label>
              <textarea className="input min-h-[84px]" value={form.text} onChange={(e) => set('text', e.target.value)} />
            </div>
            {form.options.map((o, i) => (
              <div key={i}>
                <label className="label flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={form.correctIndex === i}
                    onChange={() => set('correctIndex', i)}
                    className="accent-green-500"
                  />
                  Option {i + 1} {form.correctIndex === i && <span className="text-green-400">(correct)</span>}
                </label>
                <input className="input" value={o} onChange={(e) => setOption(i, e.target.value)} />
              </div>
            ))}
            <div>
              <label className="label">Explanation (shown after reveal)</label>
              <textarea className="input min-h-[56px]" value={form.explanation} onChange={(e) => set('explanation', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  <option value="">Pick…</option>
                  {categories.map((c) => (
                    <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="accent-brand-blue" />
              Active (available for matches)
            </label>
          </div>

          {/* Live preview */}
          <div>
            <p className="label">Live preview</p>
            <div className="rounded-xl border border-navy-700 bg-navy-950 p-4">
              <p className="mb-3 font-semibold text-white">{form.text || <span className="text-slate-600">Your question…</span>}</p>
              <div className="space-y-2">
                {form.options.map((o, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      form.correctIndex === i
                        ? 'border-green-500/60 bg-green-500/10 text-green-200'
                        : 'border-navy-700 bg-navy-800/60 text-slate-300'
                    )}
                  >
                    {o || <span className="text-slate-600">Option {i + 1}</span>}
                  </div>
                ))}
              </div>
              {form.explanation && <p className="mt-3 text-xs italic text-slate-500">{form.explanation}</p>}
            </div>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary flex-1">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {initial?.id ? 'Save changes' : 'Create question'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function QuestionsTab() {
  const { toast } = useToast();
  const [questions, setQuestions] = useState(null);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: '', difficulty: '', search: '', active: '' });
  const [editing, setEditing] = useState(null); // null | {} (new) | question (edit)
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try {
      const [qs, cats] = await Promise.all([
        adminApi.questions(filters),
        categoryApi.list().catch(() => []),
      ]);
      setQuestions(qs.questions);
      setCategories(cats || []);
    } catch (e) {
      toast.error(e.message || 'Could not load questions');
      setQuestions([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await adminApi.deleteQuestion(deleting.id);
      toast.success('Question deleted');
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not delete question');
    }
  };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="card-pad">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <label className="label">Search</label>
          <input className="input" placeholder="Question text…" value={filters.search} onChange={(e) => setF('search', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={filters.category} onChange={(e) => setF('category', e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Difficulty</label>
          <select className="input" value={filters.difficulty} onChange={(e) => setF('difficulty', e.target.value)}>
            <option value="">All</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={filters.active} onChange={(e) => setF('active', e.target.value)}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <button onClick={load} className="btn-secondary">Apply</button>
        <button onClick={() => setEditing({})} className="btn-primary">
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      {questions === null ? (
        <CardSkeleton />
      ) : questions.length === 0 ? (
        <EmptyState title="No questions" hint="Nobody matches those filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Difficulty</th>
                <th className="px-3 py-2">Correct</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className="border-t border-navy-800">
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-slate-200" title={q.text}>{q.text}</td>
                  <td className="px-3 py-2.5 text-slate-400">{q.category?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{q.difficulty}</td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 font-semibold text-green-300" title={q.options?.[q.correctIndex]}>
                    {q.options?.[q.correctIndex]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', q.isActive ? 'bg-green-500/15 text-green-400' : 'bg-slate-600/30 text-slate-400')}>
                      {q.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(q)} className="rounded-lg p-2 text-slate-400 hover:bg-navy-700 hover:text-white" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleting(q)} className="rounded-lg p-2 text-slate-400 hover:bg-navy-700 hover:text-red-300" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <QuestionModal
          initial={editing.id ? editing : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete question"
        message={`Delete "${deleting?.text?.slice(0, 60)}…"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories tab
// ---------------------------------------------------------------------------
function CategoriesTab() {
  const { toast } = useToast();
  const [categories, setCategories] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '' });
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const cats = await categoryApi.list();
      setCategories(cats || []);
    } catch (e) {
      toast.error(e.message || 'Could not load categories');
      setCategories([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setForm({ name: '', description: '', icon: '' });
    setEditingId(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    setBusy(true);
    try {
      if (editingId) {
        await adminApi.updateCategory(editingId, form);
        toast.success('Category updated');
      } else {
        await adminApi.createCategory(form);
        toast.success('Category created');
      }
      reset();
      load();
    } catch (err) {
      toast.error(err.message || 'Could not save category');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await adminApi.deleteCategory(id);
      toast.success('Category deleted');
      load();
    } catch (e) {
      toast.error(e.message || 'Could not delete category');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card-pad">
        <h3 className="mb-3 font-bold text-white">Categories</h3>
        {categories === null ? (
          <CardSkeleton />
        ) : categories.length === 0 ? (
          <EmptyState title="No categories" hint="Create one to get started." />
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c._id || c.id} className="flex items-center gap-3 rounded-xl bg-navy-800/60 px-3 py-2.5">
                <span className="text-xl">{c.icon || '❓'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{c.name}</p>
                  {c.description && <p className="truncate text-xs text-slate-400">{c.description}</p>}
                </div>
                <button
                  onClick={() => {
                    setEditingId(c._id || c.id);
                    setForm({ name: c.name, description: c.description || '', icon: c.icon || '' });
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-navy-700 hover:text-white"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(c._id || c.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-navy-700 hover:text-red-300"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={save} className="card-pad h-fit">
        <h3 className="mb-3 font-bold text-white">{editingId ? 'Edit category' : 'New category'}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Icon (emoji)</label>
            <input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="❓" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editingId ? 'Save' : 'Create'}
            </button>
            {editingId && (
              <button type="button" onClick={reset} className="btn-secondary">Cancel</button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches tab
// ---------------------------------------------------------------------------
function MatchesTab() {
  const { toast } = useToast();
  const [matches, setMatches] = useState(null);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');

  const load = async () => {
    try {
      const { matches: rows } = await adminApi.matches({ status, mode });
      setMatches(rows);
    } catch (e) {
      toast.error(e.message || 'Could not load matches');
      setMatches([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card-pad">
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {MATCH_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="input !w-auto" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All modes</option>
          <option value="casual">Casual</option>
          <option value="competitive">Competitive</option>
        </select>
        <button onClick={load} className="btn-secondary">Apply</button>
      </div>

      {matches === null ? (
        <CardSkeleton />
      ) : matches.length === 0 ? (
        <EmptyState title="No matches" hint="Nothing matches those filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Players</th>
                <th className="px-3 py-2">Questions</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Played</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id} className="border-t border-navy-800">
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{m.id.slice(-8)}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', m.mode === 'competitive' ? 'bg-brand-violet/20 text-brand-violet' : 'bg-slate-600/30 text-slate-300')}>
                      {m.mode}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{m.state}</td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {(m.players || []).map((p) => p.username).join(', ') || `${m.playerCount}`}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{m.questionCount}</td>
                  <td className="px-3 py-2.5 text-slate-400">{m.durationSec != null ? formatSeconds(m.durationSec * 1000) : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{formatTimeAgo(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log tab
// ---------------------------------------------------------------------------
function AuditTab() {
  const { toast } = useToast();
  const [logs, setLogs] = useState(null);
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    try {
      const { logs: rows } = await adminApi.auditLogs({ action });
      setLogs(rows);
    } catch (e) {
      toast.error(e.message || 'Could not load audit log');
      setLogs([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card-pad">
      <div className="mb-4 flex gap-2">
        <input
          className="input max-w-xs"
          placeholder="Filter by action, e.g. admin.users.update"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button onClick={load} className="btn-secondary">Apply</button>
      </div>

      {logs === null ? (
        <CardSkeleton />
      ) : logs.length === 0 ? (
        <EmptyState title="No audit entries" hint="Admin actions will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <Fragment key={l.id}>
                  <tr className="border-t border-navy-800">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">{formatTimeAgo(l.createdAt)}</td>
                    <td className="px-3 py-2.5 font-semibold text-white">{l.actor?.username || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-brand-blue">{l.action}</td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {l.targetType ? `${l.targetType}${l.targetId ? ` · ${String(l.targetId).slice(-8)}` : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-700 hover:text-white"
                        title="Toggle details"
                      >
                        <ChevronDown className={cn('h-4 w-4 transition', expanded === l.id && 'rotate-180')} />
                      </button>
                    </td>
                  </tr>
                  {expanded === l.id && (
                    <tr className="border-t border-navy-800/50">
                      <td colSpan={5} className="px-3 py-2">
                        <pre className="overflow-x-auto rounded-lg bg-navy-950 p-3 font-mono text-xs text-slate-400">
                          {JSON.stringify(l.metadata || {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config tab (merged into overview? No — own section inside Dashboard tab)
// ---------------------------------------------------------------------------
function ConfigSection() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [tiersText, setTiersText] = useState('');
  const [kFactor, setKFactor] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await adminApi.getConfig();
        setCfg(c);
        setTiersText(JSON.stringify(c.tiers, null, 2));
        setKFactor(String(c.kFactor));
      } catch (e) {
        toast.error(e.message || 'Could not load config');
      }
    })();
  }, [toast]);

  const save = async () => {
    setBusy(true);
    try {
      let tiers;
      try {
        tiers = JSON.parse(tiersText);
      } catch {
        toast.error('Tiers must be valid JSON');
        setBusy(false);
        return;
      }
      await adminApi.updateConfig({ tiers, kFactor: Number(kFactor) });
      toast.success('Configuration updated — applies to new matches within a minute');
      const c = await adminApi.getConfig();
      setCfg(c);
    } catch (e) {
      toast.error(e.message || 'Could not save config');
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) return <CardSkeleton />;

  return (
    <div className="card-pad">
      <h3 className="mb-1 font-bold text-white">Rating configuration</h3>
      <p className="muted mb-4 text-sm">
        Tier bands (ascending <code>min</code>) and the Elo K-factor. Applies to matches rated after the change.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Tiers (JSON array of {"{name, min}"})</label>
          <textarea
            className="input min-h-[180px] font-mono text-xs"
            value={tiersText}
            onChange={(e) => setTiersText(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">K-factor (1–200)</label>
            <input className="input" type="number" min={1} max={200} value={kFactor} onChange={(e) => setKFactor(e.target.value)} />
          </div>
          <div className="rounded-xl bg-navy-800/60 p-3 text-xs text-slate-400">
            <p className="mb-1 font-bold text-slate-200">Current scoring</p>
            <p>Base {cfg.scoring?.base} · Speed bonus {cfg.scoring?.speedBonus} · Streak {cfg.scoring?.streakBonus} (cap {cfg.scoring?.streakCap})</p>
            <p className="mt-1">Reconnect grace {Math.round((cfg.reconnectGraceMs || 0) / 1000)}s</p>
            <p className="mt-2 text-slate-500">Scoring and grace period are editable via the API; the UI editor covers tiers + K-factor.</p>
          </div>
          <button onClick={save} disabled={busy} className="btn-primary w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
export default function Admin() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="page-title mb-6 flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-brand-violet" /> Admin
      </h1>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="card-pad h-fit !p-3 lg:sticky lg:top-20">
          <ul className="grid grid-cols-3 gap-1 lg:grid-cols-1">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition',
                    tab === t.id ? 'bg-navy-700 text-white' : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                  )}
                >
                  <t.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline lg:inline">{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {tab === 'overview' && (
            <div className="space-y-6">
              <OverviewTab />
              <ConfigSection />
            </div>
          )}
          {tab === 'users' && <UsersTab />}
          {tab === 'questions' && <QuestionsTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'matches' && <MatchesTab />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </div>
    </div>
  );
}
