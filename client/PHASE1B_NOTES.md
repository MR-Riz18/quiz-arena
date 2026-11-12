# QuizArena — Phase 1b Notes (Frontend: playable multiplayer MVP)

## Route map

| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Landing: hero, how-it-works, categories (from `GET /api/categories`), footer |
| `/login`, `/register` | public (redirects to `/dashboard` when authed) | Validated forms; demo hint `player1@quizarena.local / Player123!` |
| `/dashboard` | player+ | Greeting, rating/tier, matches/wins/win-rate, create-room + join-by-code + browse actions, scoring explainer |
| `/rooms` | player+ | Public waiting rooms (`GET /api/rooms`, paginated), join buttons with full-state guard |
| `/rooms/new` | player+ | Room form: name, visibility, maxPlayers 2–8, category (or Mixed), difficulty, questionCount 3–20, timePerQuestion 5–60s → navigates to `/room/:code` |
| `/room/:code` | player+ | **Lobby**: code display + copy, config summary, player list (host crown, ready badges, connection dots), Ready toggle, host-only Start (disabled with reason until ≥2 players all ready), Leave (confirm). Socket: `room:join` on mount; `room:updated`/`room:player-joined`/`room:player-left`/`room:error`; `match:countdown` → 3-2-1 overlay; `match:started` → `/match/:matchId` |
| `/match/:matchId` | player+ | **Battle**: question x/y, `TimerBar` from server `deadline`, one-shot answer submit, locked state, live leaderboard, disconnect badges, reveal (correct green / wrong red + explanation). Reconnect via `match:reconnect` → `match:snapshot`. `match:completed` → results; `match:cancelled` → error state |
| `/match/:matchId/results` | player+ | Winner banner, placements, my stats (score/accuracy/avg response/rank), per-question review (correct highlighted, my pick marked). Non-completed matches redirect back to the battle |
| `/profile` | player+ | Avatar (read-only), email, rating/tier, W/L record, change password, logout |
| `*` | public | 404 page |

## Socket usage (see `src/context/SocketContext.jsx`)

- **One** `socket.io-client` instance, created after auth (`user` present), torn down on logout.
  Cookie auth needs no token plumbing — `withCredentials: true` only.
- API: `subscribe(event, handler)` (returns unsubscribe for `useEffect` cleanup),
  `emit(event, payload)`, `joinRoom(code)` / `leaveRoom(code)`,
  `setActiveMatch(matchId, roomCode?)` (also emits `match:reconnect` immediately),
  `clearActiveMatch()`, `connected` boolean (rendered as the navbar Live dot).
- **Reconnect**: `activeRef` keeps `{roomCode, matchId}`. On every socket `connect`,
  the client re-emits `room:join` and `match:reconnect`; the server answers with
  `room:updated` / `match:snapshot`, so refresh or drop restores state with no reload.
- The client NEVER decides correctness, scores, or timing — it renders server
  payloads (`question:started.deadline`, `question:ended.correctIndex`, leaderboards).

## Backend contract adherence

- Built strictly against `server/PHASE1_NOTES.md`: `{success,message,data}` envelope,
  cookie auth, room public shape (`players[]`, `host`, `config`), match payload shapes.
- `correctIndex`/`explanation` are only ever read from `question:ended` and from
  `GET /api/matches/:id` on completed matches — never before.
- No invented data: dashboard shows `user.stats`/`rating`/`tier` from `/auth/me`
  (no match-history endpoint exists in Phase 1, so no history list is shown).

## Known gaps / deferred

- **Avatar picker**: profile shows the avatar read-only — Phase 1 backend has no
  profile-update endpoint (planned with Phase 4 user management).
- **Rematch**: results "Play again" returns to the room lobby; one-click rematch
  flow is Phase 2.
- **Match history**: needs a Phase 3 `GET /api/matches` history endpoint.
- **Countdown animation**: functional overlay now; richer animations in Phase 2.

## Phase 2 will add

Rematch flow (host-triggered instant rematch), countdown/result animations,
full disconnect grace-period UI, live-leaderboard polish, and match-results
share view.
