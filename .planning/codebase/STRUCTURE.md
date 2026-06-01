---
last_mapped_commit: 943b76e
mapped_date: 2026-06-01
---

# Structure

## Directory Layout

```
battleship/
├── server.js              # Main Node.js/Express + Socket.IO server (~910 lines)
├── store.js               # Optional Redis persistence abstraction (~65 lines)
├── build-game.mjs         # esbuild bundler config (~30 lines)
├── package.json           # Deps + scripts (start, build, postinstall)
├── package-lock.json
├── render.yaml            # Render.com deploy config
├── README.md
├── public/                # Source assets (pre-build)
│   ├── app.jsx            # Main React SPA (~1420 lines)
│   ├── index.html         # HTML template: SEO, structured data, i18n
│   ├── style.css          # Game CSS: grid, animations, responsive
│   ├── sitemap.xml
│   ├── manifest / favicons / images
│   └── ...
├── dist/                  # Build output (esbuild)
│   ├── app.js            # Bundled/minified client
│   ├── index.html        # Copied from public
│   └── style.css         # Copied from public
└── node_modules/
```

## Key Locations

| Need | Location |
|------|----------|
| Server game logic, shot resolution | `server.js` |
| Socket.IO event handlers | `server.js` |
| Redis persistence | `store.js` |
| Client UI / screens / bot AI | `public/app.jsx` |
| HTML template, SEO, structured data | `public/index.html` |
| Styles, animations | `public/style.css` |
| Build config | `build-game.mjs` |
| Deploy config | `render.yaml` |

## Client Screens (in `public/app.jsx`)

Lobby → Placement → Battle → GameOver

## Naming Conventions

- Root-level entry files: lowercase (`server.js`, `store.js`).
- ESM build script uses `.mjs` extension (`build-game.mjs`).
- Source lives in `public/`; built output in `dist/` (generated, not edited).
- No path aliases, no barrel files. Flat structure.

## Build Pipeline

- `npm run build` / `postinstall` → `build-game.mjs` runs esbuild.
- `public/app.jsx` → bundled to `dist/app.js`.
- `index.html` and `style.css` copied `public/` → `dist/`.
- `dist/` is what the server serves.
