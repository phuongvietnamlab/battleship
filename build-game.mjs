// Builds the web game into dist/ as a self-contained bundle.
// No CDN: React + socket.io-client + app are bundled into app.js. SERVER_URL is
// injected at build time (empty = same-origin; absolute wss:// for a remote server).
//
//   npm run build:game                                              # → same-origin
//   SERVER_URL=https://battleship.onrender.com npm run build:game   # → wss to a remote server
import * as esbuild from "esbuild";
import { mkdirSync, copyFileSync } from "fs";

const SERVER_URL = process.env.SERVER_URL || "";
const OUT = "dist";

mkdirSync(OUT, { recursive: true });

await esbuild.build({
  entryPoints: ["public/app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018"],
  loader: { ".jsx": "jsx" },
  outfile: `${OUT}/app.js`,
  define: { "process.env.SERVER_URL": JSON.stringify(SERVER_URL) },
});

copyFileSync("public/index.html", `${OUT}/index.html`);
copyFileSync("public/style.css", `${OUT}/style.css`);

console.log(`Game built → ${OUT}/  (SERVER_URL=${SERVER_URL || "(same-origin)"})`);

// ─── Admin panel bundle (Phase 16) ──────────────────────────────────────────
import { existsSync } from "fs";

if (existsSync("public/admin/app.jsx")) {
  mkdirSync(`${OUT}/admin`, { recursive: true });

  await esbuild.build({
    entryPoints: ["public/admin/app.jsx"],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2018"],
    loader: { ".jsx": "jsx" },
    outfile: `${OUT}/admin/app.js`,
    define: { "process.env.SERVER_URL": JSON.stringify(SERVER_URL) },
  });

  copyFileSync("public/admin/index.html", `${OUT}/admin/index.html`);
  copyFileSync("public/admin/style.css", `${OUT}/admin/style.css`);

  console.log(`Admin built → ${OUT}/admin/`);
}