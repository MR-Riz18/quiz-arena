# QuizArena — Phase 1 Notes (Backend: playable multiplayer MVP)

## Design locks (later phases depend on these — do not change)

- **Auth**: JWT (8h) in httpOnly cookie `token` (`SameSite=lax`, `secure` in production).
  Frontend must use axios with `withCredentials: true`. Roles: `player`, `admin`.
- **JSON envelope**: `{ success, message, data }` everywhere; proper HTTP codes; central error handler.
- **CORS**: `{ origin: CLIENT_URL, credentials: true }`.
- **Server is authoritative**: question sequence, deadlines, correctness, scores, placements.
  `correctIndex`/`explanation` are NEVER sent before a question ends — only in
  `question:ended` and in `GET /api/matches/:id` when the match is completed.
- **Match engine** (`services/matchEngine.js`): in-memory `Map<matchId, liveState>`,
  created via `createMatchEngine({ io, persist })`. `persist` is injectable so unit
  tests run without a DB. Engine timers are `unref`'d.

## REST API (all under /api)

| Method & path | Auth | Body / query | Returns |
|---|---|---|---|
| `POST /auth/register` | public | `{username, email, password}` (unique both, min 8) | sets cookie; `{user}` 201 |
| `POST /auth/login` | public (rate-limited 10/15m) | `{email, password}` | sets cookie; `{user}` |
| `POST /auth/logout` | — | — | clears cookie |
| `GET /auth/me` | protect | — | `{user}` (email included — self only) |
| `PATCH /auth/password` | protect | `{currentPassword, newPassword}` | 200 |
| `POST /rooms` | protect | `{name, visibility?, config?}` | `{room, code}` 201 — code is 6-char uppercase alnum |
| `GET /rooms` | protect | `?page=&limit=` | `{rooms, page, limit, total, totalPages}` — public + waiting only |
| `GET /rooms/:code` | protect | — | `{room}` — private rooms: members only (403 otherwise) |
| `POST /rooms/:code/join` | protect | — | `{room}` — the code IS the invite for private rooms; 409 when full/started |
| `POST /rooms/:code/leave` | protect | — | `{room}` — host leaving promotes longest-waiting player; empty room is deleted |
| `GET /categories` | public | — | `{categories}` |
| `GET /questions` | protect | `?category=&difficulty=&limit=` | `{questions}` — correctIndex/explanation STRIPPED |
| `GET /matches/:id` | protect | — | `{match}` — participants only (403); answers revealed only if completed |

Room config: `maxPlayers` 2–8 (default 2), `categoryId`|`'mixed'`, `difficulty` `mixed|easy|medium|hard`,
`questionCount` 3–20 (default 5), `timePerQuestion` 5–60s (default 15), `rated` (default false).

## Socket.IO

Connect with the `token` cookie (browser) — bad/missing/expired token or disabled
account → handshake rejected (`connect_error`). Rooms: `room:<CODE>`; membership
re-validated against the Room document on every join/action.

Client → server:

| Event | Payload | Notes |
|---|---|---|
| `room:join` | `{code}` | must be a member; receives `room:updated` |
| `room:leave` | `{code}` | — |
| `room:ready` / `room:unready` | `{code}` | only while room is `waiting` |
| `match:start` | `{code}` | host only; ≥2 players, all ready |
| `answer:submit` | `{matchId, optionIndex}` | rate-limited 10/sec per socket |
| `match:reconnect` | `{matchId}` | returns `match:snapshot` |

Server → client:

| Event | Payload |
|---|---|
| `room:updated` | `{room}` (public shape) |
| `room:player-joined` / `room:player-left` | `{user}` / `{userId, username}` |
| `room:error` | `{message}` |
| `match:accepted` | `{matchId}` (private ack to the host that started) |
| `match:countdown` | `{matchId, startsInMs}` |
| `match:started` | `{matchId, roomCode, totalQuestions, players[]}` |
| `question:started` | `{matchId, questionIndex, totalQuestions, questionId, text, options[4], difficulty, deadline, serverStart}` — NO correctIndex |
| `answer:received` | `{accepted, correct?, points?, timeMs?, streak?, reason?}` — private ack to submitter |
| `score:updated` | `{matchId, scores: {userId: points}}` |
| `leaderboard:updated` | `{matchId, leaderboard: [{userId, username, avatar, score, correctCount, streak, avgTimeMs, connected, rank}]}` |
| `question:ended` | `{matchId, questionIndex, correctIndex, explanation, scores, leaderboard}` — reveal happens ONLY here |
| `match:completed` | `{matchId, placements: [{userId, username, avatar, rank, score}], scores, playerStats: {userId: {correct, answered, accuracy, avgTimeMs}}, ratingChanges: []}` |
| `match:cancelled` | `{matchId, reason}` |
| `match:snapshot` | reconnect state (see below) |
| `player:disconnected` / `player:reconnected` | `{userId, username}` |

**Reconnect**: client re-emits `match:reconnect` after re-authenticating; server returns
`match:snapshot` = `{matchId, state, questionIndex, totalQuestions, scores, leaderboard,
currentQuestion? (without answer, with remainingMs + alreadyAnswered), lastReveal?}`.
For completed matches the snapshot carries `{state:'completed', placements, scores}` from the DB.

## Match state machine

```
waiting → countdown → inProgress → questionEnded → inProgress → … → completed
   │           │            │              │
   └─────→ cancelled ←──────┴──────────────┘
```

- `startMatch`: host only, room `waiting`, ≥2 players, ALL ready. Samples questions
  (`$sample`, filtered by category/difficulty), creates the Match doc (`countdown`),
  broadcasts `match:countdown` (3s), then question 0 begins.
- Question: `serverStart = Date.now()`, `deadline = serverStart + timePerQuestion*1000`,
  broadcast `question:started`; a server timer ends the question at the deadline.
- Answers: accepted only while `state === inProgress`, `now < deadline`, player is a
  member, option 0–3, and no answer recorded yet for this question (duplicates ignored).
- Early finish: when every CONNECTED player has answered, the question ends immediately.
- `endQuestion`: reveal + 4s pause, then next question or `finalize`.
- `finalize`: placements (score desc, tie-break avg answer time asc, then username),
  denormalized player snapshots persisted, room → `completed`, user stats updated
  (matchesPlayed, wins/losses). `ratingChanges: []` — ratings arrive in Phase 3.
- Disconnects: player flagged `connected:false`, match CONTINUES, unanswered = 0 pts.
  Double-start and double-finalize are guarded.

## Scoring formula

```
correct ? 1000 + round(500 × timeRemaining / timeLimit) + min(500, 100 × streakBefore) : 0
```

- Base 1000 for a correct answer, up to +500 speed bonus (linear with time remaining),
  up to +500 streak bonus (100 per consecutive correct answer before this one).
- Wrong answers score 0 and reset the streak.

## Seed

`npm run seed` → 6 categories, 36 questions (6/category, mixed difficulty),
admin `admin@quizarena.local` / `Admin123!`,
players `player1@quizarena.local` / `Player123!` and `player2@quizarena.local` / `Player123!`.

## Tests

`npm test` (jest). Unit (no DB): scoring table, state-machine table, answer rules
(deadline/duplicates/validation/disconnect early-finish). API (mongodb-memory-server,
graceful skip when unavailable): register/login, room create/join/full, private-room
403 vs code-join, question-bank answer stripping, match participant guard.

## Deferred to later phases

- **Phase 2**: live leaderboard polish, countdown animations, match results/rematch UI hooks,
  full disconnect grace-period/abandonment policy.
- **Phase 3**: competitive matchmaking, Elo rating changes (`ratingChanges` is already in the
  payload shape), player tiers, global leaderboard, match history endpoints.
- **Phase 4**: friends/invitations, question management (admin CRUD), analytics, admin tools, deployment.
- No admin question/category CRUD in Phase 1 (seed covers the bank); no password reset flow.
