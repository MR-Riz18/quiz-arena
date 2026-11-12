import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider, useSocket } from './context/SocketContext.jsx';
import { InviteProvider } from './context/InviteContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Navbar from './components/Navbar.jsx';
import ToastStack from './components/Toast.jsx';
import { roomApi } from './api/index.js';

// Phase 2: listens for incoming rematch offers (server emits
// `match:rematch-offered` to our per-user room) and surfaces a toast with a
// one-click Join action. The offer auto-expires with the toast (60s); the room
// itself persists, so joining later via the code still works.
function RematchOffers() {
  const { subscribe } = useSocket();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(
    () =>
      subscribe('match:rematch-offered', ({ roomCode, fromUsername }) => {
        if (!roomCode) return;
        toast.action(
          'info',
          `${fromUsername || 'Someone'} wants a rematch!`,
          {
            label: `Join ${roomCode}`,
            onClick: async () => {
              try {
                await roomApi.join(roomCode);
                navigate(`/room/${roomCode}`);
              } catch (e) {
                toast.error(e.message || 'Could not join the rematch');
              }
            },
          },
          60000
        );
      }),
    [subscribe, toast, navigate]
  );
  return null;
}
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rooms from './pages/Rooms.jsx';
import RoomNew from './pages/RoomNew.jsx';
import Lobby from './pages/Lobby.jsx';
import Match from './pages/Match.jsx';
import Results from './pages/Results.jsx';
import Profile from './pages/Profile.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import History from './pages/History.jsx';
import Friends from './pages/Friends.jsx';
import Settings from './pages/Settings.jsx';
// Admin is heavy (charts) and admin-only, so it loads on demand.
const Admin = lazy(() => import('./pages/Admin.jsx'));
import NotFound from './pages/NotFound.jsx';
import { CardSkeleton } from './components/StateViews.jsx';

function Shell({ children, hideNav }) {
  return (
    <div className="min-h-screen bg-navy-950">
      {!hideNav && <Navbar />}
      <main>{children}</main>
      <ToastStack />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <InviteProvider>
              <RematchOffers />
              <Routes>
              {/* Public */}
              <Route path="/" element={<Shell><Landing /></Shell>} />
              <Route path="/login" element={<Shell><Login /></Shell>} />
              <Route path="/register" element={<Shell><Register /></Shell>} />

              {/* Authenticated */}
              <Route path="/dashboard" element={<ProtectedRoute><Shell><Dashboard /></Shell></ProtectedRoute>} />
              <Route path="/rooms" element={<ProtectedRoute><Shell><Rooms /></Shell></ProtectedRoute>} />
              <Route path="/rooms/new" element={<ProtectedRoute><Shell><RoomNew /></Shell></ProtectedRoute>} />
              <Route path="/room/:code" element={<ProtectedRoute><Shell><Lobby /></Shell></ProtectedRoute>} />
              <Route path="/match/:matchId" element={<ProtectedRoute><Shell><Match /></Shell></ProtectedRoute>} />
              <Route path="/match/:matchId/results" element={<ProtectedRoute><Shell><Results /></Shell></ProtectedRoute>} />
              <Route path="/leaderboard" element={<ProtectedRoute><Shell><Leaderboard /></Shell></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><Shell><History /></Shell></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Shell><Profile /></Shell></ProtectedRoute>} />
              <Route path="/friends" element={<ProtectedRoute><Shell><Friends /></Shell></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Shell><Settings /></Shell></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Shell><Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><CardSkeleton /></div>}><Admin /></Suspense></Shell></ProtectedRoute>} />

              <Route path="*" element={<Shell><NotFound /></Shell>} />
            </Routes>
            </InviteProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

// Re-exported for tests/docs convenience
export { Navigate };
