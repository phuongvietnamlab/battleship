---
last_mapped_commit: 943b76e
mapped_date: 2026-06-01
---

# Concerns

Technical debt, known issues, and fragile areas. Severity is best-effort triage, not audited.

## Security

| # | Concern | Severity | Location |
|---|---------|----------|----------|
| 1 | **esbuild dev-server vuln** GHSA-67mh-4wv8-2f99 (any site can send requests to dev server, read responses). Dev-only impact. | Moderate | `esbuild ^0.24.0` dep |
| 2 | **No rate limiting** on `fire` / `useAbility` socket events — abusable for spam/DoS. | High | `server.js` event handlers |
| 3 | **Weak profile/chat validation** — user-supplied names/chat not strongly sanitized. | Medium | `server.js`, `public/app.jsx` |
| 4 | **No admin/observability dashboard** — no way to inspect or moderate live rooms. | Low | — |

## Correctness / Robustness

| # | Concern | Severity | Location |
|---|---------|----------|----------|
| 5 | **Race condition** — concurrent `joinRoom` → `placeShips` can interleave on shared room state. | High | `server.js` |
| 6 | **Missing null/shape validation in `doShot()`** — malformed opponent state can crash handler. | High | `server.js` |
| 7 | **Turn-clock races** — timeout firing vs. an in-flight fire event not fully guarded. | Medium | `server.js` |

## Performance / Scaling

| # | Concern | Severity | Location |
|---|---------|----------|----------|
| 8 | **Unbounded memory growth** — `rooms` map has no enforced cleanup of abandoned rooms. | High | `server.js` |
| 9 | **No horizontal scaling** — in-memory state + single process. Multi-process needs shared state / sticky sessions. | Medium | architecture-wide |

## Test Coverage

| # | Concern | Severity |
|---|---------|----------|
| 10 | **Zero automated tests** — reconnect, timer races, grid saturation, power-ups, Redis recovery all unverified. See `TESTING.md`. | High |

## Maintainability

| # | Concern | Severity | Location |
|---|---------|----------|----------|
| 11 | **Monolithic client** — `public/app.jsx` ~1420 lines mixes screens, i18n, audio, bot AI. Hard to navigate/test. | Medium | `public/app.jsx` |
| 12 | **No lint/format config** — style drift risk, no automated guardrails. | Low | repo root |

## Suggested First Fixes

1. Guard `doShot()` against malformed state (#6) — crash risk.
2. Rate-limit `fire`/`useAbility` (#2) — abuse vector.
3. Enforce abandoned-room cleanup (#8) — memory leak.
4. Add Vitest + unit tests for shot resolution (#10).
