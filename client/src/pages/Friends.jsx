import { useEffect, useState, useCallback } from 'react';
import { Search, UserPlus, Check, X, Loader2, Send, Users, Swords, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { friendApi, invitationApi, playerApi, roomApi } from '../api/index.js';
import Avatar from '../components/Avatar.jsx';
import TierBadge from '../components/TierBadge.jsx';
import { CardSkeleton, EmptyState } from '../components/StateViews.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { cn } from '../utils/cn.js';

// Modal: pick one of my waiting rooms to invite this friend to.
function InviteModal({ friend, onClose }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rooms, setRooms] = useState(null);
  const [sending, setSending] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { rooms: all } = await roomApi.list(1, 50);
        // Only rooms I'm actually in and that are still waiting.
        const mine = (all || []).filter(
          (r) => r.status === 'waiting' && (r.players || []).some((p) => p.userId === user.id)
        );
        if (alive) setRooms(mine);
      } catch (e) {
        if (alive) {
          toast.error(e.message || 'Could not load your rooms');
          setRooms([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id, toast]);

  const send = async (roomCode) => {
    setSending(roomCode);
    try {
      await invitationApi.send(friend.username, roomCode);
      toast.success(`Invitation sent to ${friend.username}`);
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not send invitation');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="card-pad w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Invite ${friend.username}`}
      >
        <h2 className="mb-1 text-lg font-extrabold text-white">Invite {friend.username}</h2>
        <p className="muted mb-4 text-sm">Pick one of your waiting rooms.</p>
        {rooms === null ? (
          <CardSkeleton />
        ) : rooms.length === 0 ? (
          <EmptyState
            title="No waiting rooms"
            hint="Create a room first, then invite friends to it."
          />
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {rooms.map((r) => (
              <li
                key={r.code}
                className="flex items-center gap-3 rounded-xl border border-navy-700 bg-navy-800/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{r.name}</p>
                  <p className="text-xs text-slate-400">
                    <span className="font-mono font-bold text-brand-blue">{r.code}</span>
                    {' · '}{(r.players || []).length}/{r.config?.maxPlayers ?? '?'} players
                  </p>
                </div>
                <button
                  onClick={() => send(r.code)}
                  disabled={sending === r.code}
                  className="btn-primary !px-3 !py-1.5 text-xs"
                >
                  {sending === r.code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Invite
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={onClose} className="btn-secondary mt-4 w-full">
          Close
        </button>
      </div>
    </div>
  );
}

function OnlineDot({ online }) {
  return (
    <span
      className={cn('h-2.5 w-2.5 rounded-full', online ? 'bg-green-400' : 'bg-slate-600')}
      title={online ? 'Online' : 'Offline'}
    />
  );
}

export default function Friends() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [friends, setFriends] = useState(null);
  const [requests, setRequests] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [opponents, setOpponents] = useState([]);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [busy, setBusy] = useState(null);
  const debouncedQuery = useDebounce(query, 350);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([friendApi.list(), friendApi.requests()]);
      setFriends(f);
      setRequests(r);
    } catch (e) {
      toast.error(e.message || 'Could not load friends');
      setFriends([]);
      setRequests([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Recent opponents from match history (for quick re-adds).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { matches } = await playerApi.myMatches({ limit: 10 });
        const seen = new Map();
        for (const m of matches || []) {
          for (const o of m.opponents || []) {
            if (o.username !== user.username && !seen.has(o.username)) seen.set(o.username, o);
          }
        }
        if (alive) setOpponents([...seen.values()].slice(0, 8));
      } catch {
        /* optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.username]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    (async () => {
      try {
        const players = await playerApi.search(debouncedQuery.trim());
        if (alive) setResults(players.filter((p) => p.username !== user.username));
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [debouncedQuery, user.username]);

  const friendUsernames = new Set((friends || []).map((f) => f.username.toLowerCase()));

  const doRequest = async (username) => {
    setBusy(username);
    try {
      await friendApi.request(username);
      toast.success(`Friend request sent to ${username}`);
      setQuery('');
      setResults([]);
    } catch (e) {
      toast.error(e.message || 'Could not send request');
    } finally {
      setBusy(null);
    }
  };

  const doAccept = async (id) => {
    setBusy(id);
    try {
      await friendApi.accept(id);
      toast.success('Friend added');
      load();
    } catch (e) {
      toast.error(e.message || 'Could not accept request');
    } finally {
      setBusy(null);
    }
  };

  const doDecline = async (id) => {
    setBusy(id);
    try {
      await friendApi.decline(id);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not decline request');
    } finally {
      setBusy(null);
    }
  };

  const doRemove = async () => {
    if (!removeTarget) return;
    try {
      await friendApi.remove(removeTarget.id);
      toast.success('Friend removed');
      setRemoveTarget(null);
      load();
    } catch (e) {
      toast.error(e.message || 'Could not remove friend');
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="page-title mb-6 flex items-center gap-2">
        <Users className="h-7 w-7 text-brand-blue" /> Friends
      </h1>

      {/* Search + add */}
      <div className="card-pad mb-6">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
          <Search className="h-4 w-4 text-brand-blue" /> Find players
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input !pl-9"
            placeholder="Search by username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />}
        </div>
        {results.length > 0 && (
          <ul className="mt-3 space-y-2">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-navy-800/60 px-3 py-2">
                <Avatar username={p.username} avatar={p.avatar} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold text-white">{p.username}</span>
                <TierBadge tier={p.tier} />
                {friendUsernames.has(p.username.toLowerCase()) ? (
                  <span className="text-xs font-semibold text-green-400">Friends</span>
                ) : (
                  <button
                    onClick={() => doRequest(p.username)}
                    disabled={busy === p.username}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    {busy === p.username ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Incoming requests */}
      {requests !== null && requests.length > 0 && (
        <div className="card-pad mb-6">
          <h2 className="mb-3 font-bold text-white">
            Incoming requests <span className="text-slate-400">({requests.length})</span>
          </h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-navy-800/60 px-3 py-2">
                <Avatar username={r.from?.username} avatar={r.from?.avatar} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold text-white">{r.from?.username}</span>
                <button onClick={() => doAccept(r.id)} disabled={busy === r.id} className="btn-primary !px-3 !py-1.5 text-xs">
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
                <button onClick={() => doDecline(r.id)} disabled={busy === r.id} className="btn-secondary !px-3 !py-1.5 text-xs">
                  <X className="h-3.5 w-3.5" /> Decline
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Friends list */}
      <div className="card-pad mb-6">
        <h2 className="mb-3 font-bold text-white">
          My friends {friends !== null && <span className="text-slate-400">({friends.length})</span>}
        </h2>
        {friends === null ? (
          <CardSkeleton />
        ) : friends.length === 0 ? (
          <EmptyState title="No friends yet" hint="Search for players above and send a request." />
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl bg-navy-800/60 px-3 py-2">
                <div className="relative">
                  <Avatar username={f.username} avatar={f.avatar} size="sm" />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <OnlineDot online={f.isOnline} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{f.username}</p>
                  <p className="text-xs text-slate-400">{f.rating} rating</p>
                </div>
                <TierBadge tier={f.tier} />
                <button onClick={() => setInviteTarget(f)} className="btn-secondary !px-3 !py-1.5 text-xs">
                  <Send className="h-3.5 w-3.5" /> Invite
                </button>
                <button
                  onClick={() => setRemoveTarget(f)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-navy-700 hover:text-red-300"
                  title="Remove friend"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent opponents */}
      {opponents.length > 0 && (
        <div className="card-pad">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Swords className="h-4 w-4 text-brand-violet" /> Recent opponents
          </h2>
          <ul className="space-y-2">
            {opponents
              .filter((o) => !friendUsernames.has(o.username.toLowerCase()))
              .map((o) => (
                <li key={o.username} className="flex items-center gap-3 rounded-xl bg-navy-800/60 px-3 py-2">
                  <Avatar username={o.username} avatar={o.avatar} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white">{o.username}</span>
                  <button onClick={() => doRequest(o.username)} disabled={busy === o.username} className="btn-secondary !px-3 !py-1.5 text-xs">
                    {busy === o.username ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Add
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {inviteTarget && <InviteModal friend={inviteTarget} onClose={() => setInviteTarget(null)} />}
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove friend"
        message={`Remove ${removeTarget?.username} from your friends?`}
        confirmLabel="Remove"
        onConfirm={doRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
