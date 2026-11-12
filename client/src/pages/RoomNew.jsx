import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { roomApi, categoryApi } from '../api/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { cn } from '../utils/cn.js';

export default function RoomNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [categoryId, setCategoryId] = useState('mixed');
  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(5);
  const [timePerQuestion, setTimePerQuestion] = useState(15);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    categoryApi.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Give your room a name.');
      return;
    }
    setBusy(true);
    try {
      const { room, code } = await roomApi.create({
        name: name.trim(),
        visibility,
        config: {
          maxPlayers: Number(maxPlayers),
          categoryId,
          difficulty,
          questionCount: Number(questionCount),
          timePerQuestion: Number(timePerQuestion),
        },
      });
      toast.success(`Room "${room.name}" created!`);
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err.message || 'Could not create room');
    } finally {
      setBusy(false);
    }
  };

  const seg = (value, setValue, options) => (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setValue(o.value)}
          className={cn(
            'rounded-lg border px-3.5 py-2 text-sm font-semibold transition',
            value === o.value
              ? 'border-brand-blue bg-brand-blue/15 text-white'
              : 'border-navy-600 bg-navy-800 text-slate-400 hover:border-slate-500'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="page-title mb-1">Create a room</h1>
      <p className="muted mb-6">Set the rules, then share the code with your friends.</p>

      <form onSubmit={submit} className="card-pad space-y-6">
        <div>
          <label className="label" htmlFor="name">Room name</label>
          <input
            id="name" className="input" value={name} maxLength={60}
            onChange={(e) => setName(e.target.value)} placeholder="Friday night trivia"
          />
        </div>

        <div>
          <span className="label">Visibility</span>
          {seg(visibility, setVisibility, [
            { value: 'public', label: '🌐 Public — listed for anyone' },
            { value: 'private', label: '🔒 Private — code only' },
          ])}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="maxPlayers">Max players: <span className="text-white">{maxPlayers}</span></label>
            <input
              id="maxPlayers" type="range" min={2} max={8} value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)} className="w-full accent-sky-400"
            />
          </div>
          <div>
            <label className="label" htmlFor="questionCount">Questions: <span className="text-white">{questionCount}</span></label>
            <input
              id="questionCount" type="range" min={3} max={20} value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)} className="w-full accent-sky-400"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="category">Category</label>
          <select
            id="category" className="input" value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="mixed">Mixed — everything</option>
            {categories.map((c) => (
              <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Difficulty</span>
          {seg(difficulty, setDifficulty, [
            { value: 'mixed', label: 'Mixed' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ])}
        </div>

        <div>
          <label className="label" htmlFor="timePerQuestion">Time per question: <span className="text-white">{timePerQuestion}s</span></label>
          <input
            id="timePerQuestion" type="range" min={5} max={60} step={5} value={timePerQuestion}
            onChange={(e) => setTimePerQuestion(e.target.value)} className="w-full accent-sky-400"
          />
        </div>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Link to="/rooms" className="btn-secondary flex-1">Cancel</Link>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Create room
          </button>
        </div>
      </form>
    </div>
  );
}
