import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { useSocket } from './SocketContext.jsx';
import { useToast } from './ToastContext.jsx';
import { invitationApi } from '../api/index.js';

const InviteContext = createContext(null);
export const useInvites = () => useContext(InviteContext);

const POLL_MS = 30000;

// App-wide invitation state: polls for pending invites every 30s and also
// listens for the real-time `invite:received` socket event. Accepting drops
// the player straight into the room lobby.
export function InviteProvider({ children }) {
  const { user } = useAuth();
  const { subscribe } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [invites, setInvites] = useState([]);
  const invitesRef = useRef(invites);
  invitesRef.current = invites;

  const refresh = useCallback(async () => {
    if (!user) {
      setInvites([]);
      return;
    }
    try {
      setInvites(await invitationApi.list());
    } catch {
      /* badge is best-effort */
    }
  }, [user]);

  const acceptInvite = useCallback(
    async (invitationId) => {
      try {
        const { code } = await invitationApi.accept(invitationId);
        toast.success('Invitation accepted — joining room');
        setInvites((prev) => prev.filter((i) => i.id !== invitationId));
        navigate(`/room/${code}`);
      } catch (e) {
        toast.error(e.message || 'Could not accept invitation');
        refresh();
      }
    },
    [navigate, refresh, toast]
  );

  const declineInvite = useCallback(
    async (invitationId) => {
      try {
        await invitationApi.decline(invitationId);
        setInvites((prev) => prev.filter((i) => i.id !== invitationId));
      } catch (e) {
        toast.error(e.message || 'Could not decline invitation');
        refresh();
      }
    },
    [refresh, toast]
  );

  // Initial load + 30s polling while logged in.
  useEffect(() => {
    refresh();
    if (!user) return undefined;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [user, refresh]);

  // Real-time invites: toast with Accept / Decline actions.
  useEffect(() => {
    if (!user) return undefined;
    return subscribe('invite:received', (payload = {}) => {
      const { invitationId, fromUsername, roomCode, roomName } = payload;
      if (!invitationId) return;
      refresh();
      toast.action(
        'info',
        `${fromUsername || 'Someone'} invited you to "${roomName || roomCode}"`,
        {
          label: 'Accept',
          onClick: () => acceptInvite(invitationId),
        },
        60000
      );
    });
  }, [user, subscribe, toast, refresh, acceptInvite]);

  return (
    <InviteContext.Provider value={{ invites, refresh, acceptInvite, declineInvite }}>
      {children}
    </InviteContext.Provider>
  );
}
