# QuizArena

Real-time multiplayer quiz battles — React + Vite + Tailwind client, Express + MongoDB + Socket.IO server.

## Run it

**Server** (needs MongoDB running and a `.env` — see `server/.env.example`):

```bash
cd server
cp .env.example .env   # then fill in MONGO_URI and JWT_SECRET
npm install
npm run seed           # 6 categories, 36 questions, demo users (optional)
npm run dev            # http://localhost:5001
```

Seed logins: admin `admin@quizarena.local` / `Admin123!`, players
`player1@quizarena.local` / `Player123!` and `player2@quizarena.local` / `Player123!`.

**Client** (dev, proxies `/api` and `/socket.io` to the server on port 5001):

```bash
cd client
npm install
npm run dev            # http://localhost:5173
```

Production build: `npm run build` in `client/` (output `client/dist/`).
With `NODE_ENV=production` the server serves that build itself on port 5001
(see `Dockerfile` / `docker-compose.yml` for the Docker setup).

## API

All REST endpoints live under `/api` and return `{ success, message, data }`.
Auth is a JWT in the httpOnly `token` cookie. See `server/PHASE1_NOTES.md`
for the full endpoint + Socket.IO event reference, and `CHANGES.md` for what
was fixed and modernised in this copy.
