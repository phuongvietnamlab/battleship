---
phase: 01
slug: foundation
status: verified
threats_open: 0
asvs_level: 2
created: 2026-06-02
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all 3 PLAN.md files carried `<threat_model>` blocks); audit verified each mitigation exists in the implementation. Verify-mitigations mode, not retroactive STRIDE.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser clientId → server upsert | Untrusted localStorage clientId crosses into a DB write | guest identifier (low sensitivity) |
| env → Postgres connection | Connection params (secrets) from env; SSL posture env-gated | DB credentials (high sensitivity) |
| server → Postgres | All SQL crosses the process boundary into the DB | parameterized queries |
| client socket → fire/useAbility/chat handlers | Untrusted, possibly scripted, event stream into game logic | game actions (medium) |
| turn timer ↔ in-flight fire | Concurrency boundary between setTimeout callback and socket handler | shot resolution state |
| client fire payload → doShot | Untrusted, possibly malformed shot payload into resolution logic | coordinates (medium) |
| client → rooms map | Continuous/abandoned room creation into long-lived in-memory state | room objects (DoS surface) |
| client profile/chat → DB + other clients' DOM | User-supplied strings stored and later rendered (stored-XSS surface) | display strings (high — XSS) |
| browser → HTTP responses | CSP governs what the page may load/execute | response headers |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-02 | Tampering/Injection | upsertGuestCredential SQL path | mitigate | clientId bound as `$1` both CTE arms (`db.js:82,103`); static DDL migrations | closed |
| T-01-D1 | DoS | pg connection pool | mitigate | Single shared pool `max:10`, one `new Pool` at module scope (`db.js:21,29,32`) | closed |
| T-01-I1 | Info Disclosure | DB credentials | accept | Secrets from `process.env.*` only; pool error logs `e.message` only, never credentials (`db.js:20-34`) | closed |
| T-01-A1 | Availability | guest DB write | mitigate | `upsertGuestCredential` try/catch, never rethrows; all 5 call sites fire-and-forget → degrades to RAM-only (`db.js:108-111`) | closed |
| T-01-T2 | Tampering | half-migrated schema | mitigate | Fail-loud runner; boot try/catch `process.exit(1)` before `server.listen()` on bad migration (`server.js:1029-1034`) | closed |
| T-01-SC | Tampering | npm installs (pg, vitest) | mitigate | Blocking-human checkpoint verified pg@brianc, vitest@vitest-dev pre-install (01-01-SUMMARY Task 0) | closed |
| T-02-01 | DoS | fire/useAbility/chat handlers | mitigate | Per-player RateLimiterMemory 2/s, 1/s, 5/10s → `RATE_LIMITED`; `socket.disconnect(true)` after abuse threshold (`server.js:80-82,810-816,851-857,937-944`) | closed |
| T-02-07 | Tampering | turn-clock resolution | mitigate | `room.resolving` guard; `onTurnTimeout` early-return; set/clear in finally around every doShot (`server.js:542,653,824-841,912-923`) | closed |
| T-02-R1 | Repudiation | rate-limit violations | accept | Per-socket disconnect is the Phase-1 response; account-level violation flagging deferred to Phase 2+ (no accounts yet) | closed |
| T-02-SC | Tampering | npm install (rate-limiter-flexible) | mitigate | Blocking-human checkpoint verified package pre-install (01-02-SUMMARY Task 0) | closed |
| T-03-02 | DoS | doShot resolution | mitigate | Guard-clause cells-array + null/shape check returns `BAD_STATE` before property access (`server.js:562,566`) | closed |
| T-03-03 | DoS | rooms map memory | mitigate | `sweepRooms()` evicts empty + idle (>5min) rooms every 60s with `clearTurnTimer`; `.unref()` interval (`server.js:502-511,1048`) | closed |
| T-03-04 | Tampering/Info Disclosure (Stored XSS) | profile name + chat | mitigate | `sanitizeProfile` + `sanitizeChat` strip control chars, cap length, `escapeHtml` (WR-02 fix); CSP `script-src 'self'` (`server.js:177,187-193,949`) | closed |
| T-03-E1 | Elevation (script execution) | client page | mitigate | CSP header `script-src 'self'`, `frame-ancestors 'none'`, no `unsafe-inline`/`unsafe-eval` in script-src; `cspMiddleware` via `app.use` (`server.js:46-51`) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-I1 | DB credentials sourced from env only; not logged; localhost EC2 connection; SSL opt-in via `PG_SSL=true`. Re-evaluate if the connection moves off-host. | phuongvietnamlab | 2026-06-02 |
| AR-02 | T-02-R1 | Rate-limit violations handled by per-socket disconnect only; account-level violation flagging deferred to Phase 2+ when accounts exist. | phuongvietnamlab | 2026-06-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-02 | 14 | 14 | 0 | gsd-security-auditor (verify-mitigations mode) |

Notes: Code review (01-REVIEW.md) surfaced 2 BLOCKERs — CR-01 (ESM `export` broke CJS boot) and CR-02 (migration CTE leaked orphan `users` rows). Both confirmed FIXED in the audited implementation (`module.exports` CJS form `server.js:1067`; conditional `INSERT...SELECT WHERE NOT EXISTS` `db.js:85-95`). No unregistered threat flags — all 3 SUMMARY.md Threat Flags sections report "None" (changes reduce attack surface).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-02
