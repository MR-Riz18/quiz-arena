require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');
const { createMatchEngine } = require('./services/matchEngine');
const { createMatchmaker } = require('./services/matchmaking');
const { initSocket } = require('./socket');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const questionRoutes = require('./routes/questions');
const matchRoutes = require('./routes/matches');
const leaderboardRoutes = require('./routes/leaderboards');
const playerRoutes = require('./routes/players');
const matchmakingRoutes = require('./routes/matchmaking');
const friendRoutes = require('./routes/friends'); // Phase 4
const invitationRoutes = require('./routes/invitations'); // Phase 4
const adminRoutes = require('./routes/admin'); // Phase 4

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'QuizArena API is up', data: { time: new Date().toISOString() } });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api', questionRoutes); // /api/categories, /api/questions
app.use('/api/matches', matchRoutes);
app.use('/api/leaderboards', leaderboardRoutes); // Phase 3
app.use('/api/players', playerRoutes); // Phase 3
app.use('/api/matchmaking', matchmakingRoutes); // Phase 3
app.use('/api/friends', friendRoutes); // Phase 4
app.use('/api/invitations', invitationRoutes); // Phase 4
app.use('/api/admin', adminRoutes); // Phase 4

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', data: null });
});

// Phase 4: same-origin production deploy — serve the built client.
// Only active when NODE_ENV=production and client/dist exists (Docker build).
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const fs = require('fs');
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    // SPA fallback — /api and /socket.io are already handled above.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
    console.log('Serving client/dist in production mode');
  }
}

app.use(errorHandler);

const httpServer = http.createServer(app);

// Match engine singleton (in-memory authoritative state) + Socket.IO.
const engine = createMatchEngine();
// Phase 3: matchmaking singleton (in-memory queue + 5s matcher tick).
const matchmaker = createMatchmaker({ engine });
const io = initSocket(httpServer, engine, matchmaker);
matchmaker.setIO(io);
engine.setIO(io);
app.set('io', io); // controllers emit cross-user events (e.g. rematch offers)
app.set('matchmaker', matchmaker); // matchmaking REST controllers
app.set('engine', engine); // Phase 4: admin stats read live match count

const PORT = process.env.PORT || 5001;

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error(
      'JWT_SECRET is not set. Copy server/.env.example to server/.env, set JWT_SECRET to a long random secret, then restart the server.'
    );
    process.exit(1);
  }
  await connectDB();
  httpServer.listen(PORT, () => console.log(`QuizArena server on :${PORT}`));
}

// Exported for tests (supertest) — only listen when run directly.
if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.engine = engine;
module.exports.io = io;
