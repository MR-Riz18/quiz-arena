import { useState } from 'react';
import { Bell, Check, X, Loader2 } from 'lucide-react';
import { useInvites } from '../context/InviteContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';
import { cn } from '../utils/cn.js';

export default function InviteBell() {
  const { invites, acceptInvite, declineInvite } = useInvites();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const handle = async (id, fn) => {
    setBusy(id);
    try {
      await fn(id);
    } catch (e) {
      toast.error(e.message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-300 transition hover:bg-navy-800 hover:text-white"
        aria-label="Invitations"
        title="Room invitations"
      >
        <Bell className="h-5 w-5" />
        {invites.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-violet px-1 text-[11px] font-extrabold text-white">
            {invites.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-navy-700 bg-navy-900 shadow-2xl">
            <p className="border-b border-navy-800 px-4 py-2.5 text-sm font-bold text-white">
              Invitations {invites.length > 0 && <span className="text-slate-400">({invites.length})</span>}
            </p>
            {invites.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No pending invitations.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {invites.map((inv) => (
                  <li key={inv.id} className="border-b border-navy-800/60 px-4 py-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <Avatar username={inv.from?.username} avatar={inv.from?.avatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {inv.from?.username || 'Someone'}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          invited you to <span className="font-semibold text-slate-200">{inv.room?.name}</span>
                          <span className="ml-1 font-mono text-brand-blue">{inv.room?.code}</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handle(inv.id, acceptInvite)}
                        disabled={busy === inv.id}
                        className="btn-primary flex-1 !py-1.5 text-xs"
                      >
                        {busy === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Accept
                      </button>
                      <button
                        onClick={() => handle(inv.id, declineInvite)}
                        disabled={busy === inv.id}
                        className={cn('btn-secondary flex-1 !py-1.5 text-xs')}
                      >
                        <X className="h-3.5 w-3.5" /> Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
