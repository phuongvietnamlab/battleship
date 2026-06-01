---
last_mapped_commit: 943b76e
mapped_date: 2026-06-01
---

# Conventions

## Language & Tooling

- **JavaScript / JSX** throughout. No TypeScript.
- **No linter / formatter config** — no ESLint, no Prettier present.
- React 18 on the client; Node.js + Express + Socket.IO on the server.
- Build via esbuild (`build-game.mjs`).

## Naming

- `camelCase` for functions and variables.
- `UPPERCASE` for constants (e.g. error codes, game rule constants).
- Lowercase filenames for entry files (`server.js`, `store.js`).

## Error Handling

- **Guard-clause style** — early returns on invalid input rather than nested conditionals.
- **Structured error codes** returned to clients, e.g. `ROOM_NOT_FOUND`, `BAD_PLACEMENT`.
- **try/catch reserved for optional features** — Redis connection, `localStorage`, Web Audio. Core game logic relies on guards, not exceptions.

## Logging

- Minimal `console` logging.
- Prefixed context tags, e.g. `[prefix] message`, for grep-ability.

## Code Organization

- **Frontend:** single monolithic JSX file — `public/app.jsx` (~1420 lines) holds all screens, i18n, audio, bot AI.
- **Backend:** modular — `server.js` (logic + handlers), `store.js` (persistence).
- No path aliases. No barrel/index re-export files. Flat imports.

## i18n

- Bilingual EN / VI strings embedded in `public/app.jsx` and `public/index.html`.

## Patterns to Follow

- Validate on the **server** — never trust client-sent coordinates or state.
- Keep optional features **gracefully degradable** (Redis, audio, storage all no-op if unavailable).
- Add new error outcomes as **named codes**, not free-text strings.
