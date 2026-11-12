# QuizArena — Changes (modernised copy)

No API contract, routes, features, or branding were changed. All fixes below
keep the existing behaviour; only defaults that disagreed with the rest of the
project were aligned.

## Bugs found & fixed

1. **Dev API proxy pointed at the wrong port** — `client/vite.config.js`
   proxied `/api` and `/socket.io` to `http://localhost:5000`, but the server
   listens on port **5001** by default (`server/server.js`, `Dockerfile`,
   `docker-compose.yml`). In `npm run dev` every API call and the socket
   connection failed. Fixed: proxy targets now `http://localhost:5001`.
2. **CORS default origin did not match the Vite dev server** —
   `server/server.js` and `server/socket/index.js` both defaulted
   `CLIENT_URL` to `http://localhost:5174`, while Vite serves the client on
   **5173**. Without `CLIENT_URL` set, the cookie-based auth and Socket.IO
   handshake were rejected by CORS in dev. Fixed: default is now
   `http://localhost:5173` in both files.
3. **Dead code** — `client/src/hooks/useMounted.js` was never imported
   anywhere. Removed (the `useDebounce` hook in the same folder is used by
   `Friends.jsx` and stays).
## Fix added 2026-11-12 — signup / login gave "Request failed with status code 500"

**Cause (reproduced live):** if `JWT_SECRET` is missing from `server/.env`, the server still starts and the database still works — but the moment signup or login tries to sign a login token, `jsonwebtoken` throws `secretOrPrivateKey must have a value`, and the server answers 500. Both signup and login hit the same code, so both failed the same way. The tests never caught it because they set `JWT_SECRET=test-secret` themselves.

**Fix (no API change):**
- `server/server.js` — now loads `.env` from the server folder itself, so it works even if you start the server from a different folder; and it now refuses to start without `JWT_SECRET`, printing a clear message telling you to copy `server/.env.example` to `server/.env` and set `JWT_SECRET`.
- `server/middleware/auth.js` — `signToken()` now throws a clear "Server is missing JWT_SECRET" error instead of the cryptic jsonwebtoken message.
- `server/seed/seed.js` — same `.env`-from-server-folder fix.

**If you see this 500:** in `server/`, run `cp .env.example .env`, open `.env`, set `JWT_SECRET` to a long random secret (for example the output of `openssl rand -hex 32`), make sure `MONGO_URI` is set too, then restart the server with `npm run dev`.

6. **No environment template** — the server requires `MONGO_URI` and
   `JWT_SECRET` but shipped no `.env.example`, so a fresh setup failed with
   only `MONGO_URI is not set`. Added `server/.env.example` documenting every
   variable (`MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRE`, `PORT`, `CLIENT_URL`,
   `RECONNECT_GRACE_MS`).
5. **No root README** — added `README.md` with how to run client + server.

Checked and found **not** broken (no change made): every client API module
against its server route (`auth`, `rooms`, `categories`, `questions`,
`matches`, `leaderboards`, `players`, `matchmaking`, `friends`,
`invitations`, `admin`); response shapes the pages consume
(`toPublicJSON` room shape, leaderboard rows, history rows, admin stats);
and every Socket.IO event the client subscribes to has a matching server
emit, and vice versa (`room:*`, `match:*`, `question:*`, `answer:*`,
`leaderboard:updated`, `matchmaking:*`, `match:found`, `invite:received`,
`player:disconnected/reconnected/abandoned`).

## UI modernisation (same dark navy theme, same pages)

- `client/src/index.css` — new shared utilities: `.card-hover` (lift +
  brand-coloured border on hover), `.eyebrow` (small uppercase section
  label), `.gradient-text`.
- `client/src/components/Navbar.jsx` — active nav link is now a
  blue→violet gradient pill with a ring instead of a flat block; header has
  a soft drop shadow.
- `client/src/pages/Landing.jsx` — hero animates in on load; "How it works"
  and "Battle arenas" sections got eyebrow labels and clearer headings;
  step and category cards lift on hover.
- `client/src/pages/Rooms.jsx` — room cards lift on hover.
- `client/src/pages/Dashboard.jsx` — greeting card has a gradient top strip
  and a fade-in entrance.
- `client/src/App.jsx` — the heavy Admin page (charts) is now lazy-loaded
  with a skeleton fallback, so the main bundle is smaller for regular
  players. Same route (`/admin`, admin-only), same page.

## How to run

```bash
# server (MongoDB required; copy server/.env.example to server/.env first)
cd server && npm install && npm run seed && npm run dev   # :5001

# client
cd client && npm install && npm run dev                   # :5173
```

Production: `npm run build` in `client/`; the server serves `client/dist`
itself when `NODE_ENV=production` (see `Dockerfile` / `docker-compose.yml`).

## What was tested

- **Client build**: `cd client && npm install && npm run build` → ✅ passed.
  `vite build` in 11.68s: `dist/index.html` 0.83 kB, CSS 44.16 kB
  (7.95 kB gzip), main JS chunk 392.40 kB (118.03 kB gzip), plus a
  separate lazy-loaded `Admin-*.js` chunk of 414.72 kB (113.52 kB gzip)
  that only downloads for admins. Before the Admin split the single
  chunk was 805.95 kB and Vite warned about chunk size; that warning is
  now gone.
- **Server syntax**: `node --check` on every file under `server/` → ✅ passed.
- **Server tests**: `cd server && npm test` (jest, in-memory MongoDB) →
  ✅ **98/98 passed** across 7 suites (`api`, `phase2`, `phase3`, `phase4`,
  `deadline`, `scoring`, `statemachine`).
- **Not run live** (no live MongoDB in this environment): end-to-end
  register → create room → play a match in the browser, and `npm run seed`
  against a real database. The test suite covers the same API + match-engine
  paths against in-memory MongoDB instead.
