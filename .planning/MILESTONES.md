# Milestones

## v1.0 MVP (Shipped: 2026-06-04)

**Phases completed:** 6 phases, 27 plans, 18 tasks

**Key accomplishments:**

- Shared pg.Pool singleton with auto-applying numbered migration runner, identity schema (users+credentials), transparent guest-credential upsert on all connect paths, and Vitest test harness — all as a complete vertical persistence slice.
- Per-player RateLimiterMemory guards (2/s, 1/s, 5/10s) on fire/useAbility/chat with abuse-disconnect, plus a `room.resolving` try/finally flag closing the simultaneous fire+timeout race (SEC-01, D-09).
- doShot null/shape guard (BAD_STATE, no throws), hybrid idle-room eviction sweep (60s interval), escapeHtml + sanitizeProfile extension + sanitizeChat, and a Content-Security-Policy middleware — closing SEC-02, SEC-03, SEC-04 end-to-end with 41 automated tests.
- Created `test/elo.test.js` and `test/ranking.test.js`. Both files use the `test/match.test.js` header verbatim (vitest imports, `fileURLToPath`, `rootDir`). `elo.test.js` is intentionally RED (cannot resolve `../elo.js` before Task 2). `ranking.test.js` has static DDL checks (all RED before Task 3) and static grep checks for `RANKED_REQUIRES_ACCOUNT`/`RANKED_REQUIRES_CLASSIC` (RED until Plan 02). DB-gated integration stubs (Plans 03–05) are present but skipped via `describe.skipIf(!hasDb)`.
- server.js `room.ranked` flag + two server-authoritative error codes (RANKED_REQUIRES_ACCOUNT, RANKED_REQUIRES_CLASSIC) + lobby ranked toggle with guest-disable and EN/VI i18n in app.jsx
- Redis-cached top-100 leaderboard (rd<110 provisional gate, 300s TTL, Postgres fallback) served via GET /api/leaderboard with React UI and EN/VI i18n
- Standalone Node CLI archives the entire ratings ladder to rating_history then soft-resets active ratings toward 1500 in a single Postgres transaction, with UNIQUE-label idempotency and zero HTTP surface (RANK-05/D-11/D-12/D-13)
- Closed the ranked-data-loss crash-recovery bug (CR-01) by adding ranked/recorded/userId to the Redis snapshot round-trip, proved by 14 no-DB TDD tests; flipped RANK-02 traceability to Complete.
- Per-IP RateLimiterMemory (30/min) + 10s in-process cache on GET /api/leaderboard closes CR-02 RANK-04 production-hardening gap.
- Four distinct bot targeting algorithms (Easy/Medium/Hard/Insane) proven by N=200 headless Vitest simulation with observable shot-count separation (SC#2) and Medium regression anchor (SC#3).
- Replaced single "Play vs Bot" button with a 4-button Easy/Medium/Hard/Insane difficulty row that persists the last pick in localStorage (whitelist-validated), localizes EN/VI, and threads the chosen tier into `startBot(false, tier)` for one-tap start — human-verified in browser.

---
