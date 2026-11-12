import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

/**
 * Single socket.io-client instance for the whole app, created only after auth.
 * Auth rides on the httpOnly cookie (withCredentials), so no token handling here.
 *
 * Reconnect strategy: `activeRef` remembers the last room code and match id.
 * On every (re)connect we re-emit `room:join` and `match:reconnect`, so the
 * server re-sends snapshots and the UI resynchronizes without a refresh.
 */
export function SocketProvider({ children }) {
  const { user, authLoading } = useAuth();
  const socketRef = useRef(null);
  const activeRef = useRef({ roomCode: null, matchId: null });
  const [connected, setConnected] = useState(false);

  const getSocket = useCallback(() => {
    if (!socketRef.current) {
      // In production the Socket.IO server is the hosted backend
      // (VITE_API_URL); unset in dev, io() connects to the same origin.
      const s = io(import.meta.env.VITE_API_URL || undefined, {
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 8000,
        timeout: 10000,
      });
      s.on('connect', () => {
        setConnected(true);
        const { roomCode, matchId } = activeRef.current;
        if (roomCode) s.emit('room:join', { code: roomCode });
        if (matchId) s.emit('match:reconnect', { matchId });
      });
      s.on('disconnect', () => setConnected(false));
      s.on('connect_error', () => setConnected(false));
      socketRef.current = s;
    }
    return socketRef.current;
  }, []);

  const connect = useCallback(() => {
    getSocket().connect();
  }, [getSocket]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
    activeRef.current = { roomCode: null, matchId: null };
  }, []);

  // Tie socket lifetime to the auth session.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      connect();
    } else {
      disconnect();
    }
  }, [user?.id, authLoading, connect, disconnect]);

  // Subscribe to a server event; returns an unsubscribe function for useEffect cleanup.
  const subscribe = useCallback(
    (event, handler) => {
      const s = getSocket();
      s.on(event, handler);
      return () => {
        s.off(event, handler);
      };
    },
    [getSocket]
  );

  const emit = useCallback(
    (event, payload) => {
      getSocket().emit(event, payload);
    },
    [getSocket]
  );

  const joinRoom = useCallback(
    (code) => {
      activeRef.current.roomCode = code;
      getSocket().emit('room:join', { code });
    },
    [getSocket]
  );

  const leaveRoom = useCallback(
    (code) => {
      if (activeRef.current.roomCode === code) activeRef.current.roomCode = null;
      getSocket().emit('room:leave', { code });
    },
    [getSocket]
  );

  // Mark a match as active. Emits match:reconnect immediately so the caller gets
  // a snapshot; the active match is also re-requested on every reconnect.
  const setActiveMatch = useCallback(
    (matchId, roomCode) => {
      activeRef.current = {
        roomCode: roomCode !== undefined ? roomCode : activeRef.current.roomCode,
        matchId,
      };
      if (matchId) getSocket().emit('match:reconnect', { matchId });
    },
    [getSocket]
  );

  const clearActiveMatch = useCallback(() => {
    activeRef.current.matchId = null;
  }, []);

  const value = {
    connected,
    connect,
    disconnect,
    subscribe,
    emit,
    joinRoom,
    leaveRoom,
    setActiveMatch,
    clearActiveMatch,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
