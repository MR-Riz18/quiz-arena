import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, Lock, Globe, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { roomApi } from '../api/index.js';
import { useToast } from '../context/ToastContext.jsx';
import { CardSkeleton, EmptyState, ErrorState } from '../components/StateViews.jsx';
import Avatar from '../components/Avatar.jsx';
import { cn } from '../utils/cn.js';

export default function Rooms() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joiningCode, setJoiningCode] = useState(null);

  const load = async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const data = await roomApi.list(p, 12);
      setRooms(data.rooms || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Could not load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (code) => {
    setJoiningCode(code);
    try {
      await roomApi.join(code);
      navigate(`/room/${code}`);
    } catch (e) {
      toast.error(e.message || 'Could not join room');
      setJoiningCode(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Open rooms</h1>
          <p className="muted mt-1">Public lobbies waiting for players — jump in or start your own.</p>
        </div>
        <Link to="/rooms/new" className="btn-primary shrink-0"><Plus className="h-5 w-5" /> Create room</Link>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(page)} />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No open rooms right now"
          hint="Be the first — create a room and invite your friends with the code."
          action={<Link to="/rooms/new" className="btn-primary"><Plus className="h-5 w-5" /> Create room</Link>}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => {
              const players = room.players || [];
              const max = room.config?.maxPlayers ?? 8;
              const full = players.length >= max;
              return (
                <div key={room.code} className="card-pad card-hover flex flex-col !p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="truncate font-bold text-white">{room.name}</h3>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        room.visibility === 'private'
                          ? 'bg-brand-violet/15 text-brand-violet'
                          : 'bg-brand-blue/15 text-brand-blue'
                      )}
                    >
                      {room.visibility === 'private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      {room.visibility}
                    </span>
                  </div>
                  <p className="mb-3 font-mono text-xs tracking-[0.25em] text-slate-500">{room.code}</p>
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {players.slice(0, 5).map((p) => (
                        <Avatar key={p.userId} username={p.username} avatar={p.avatar} size="xs" className="ring-2 ring-navy-900" />
                      ))}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Users className="h-3.5 w-3.5" /> {players.length}/{max}
                    </span>
                    {room.config?.difficulty && room.config.difficulty !== 'mixed' && (
                      <span className="rounded bg-navy-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                        {room.config.difficulty}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn-secondary mt-auto w-full !py-2 text-sm"
                    disabled={full || joiningCode === room.code}
                    onClick={() => join(room.code)}
                  >
                    {full ? 'Room full' : joiningCode === room.code ? 'Joining…' : 'Join room'}
                  </button>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                className="btn-secondary !p-2" disabled={page <= 1}
                onClick={() => load(page - 1)} aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
              <button
                className="btn-secondary !p-2" disabled={page >= totalPages}
                onClick={() => load(page + 1)} aria-label="Next page"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
