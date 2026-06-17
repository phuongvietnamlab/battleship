// Builds the web game into dist/ as a self-contained bundle.
// No CDN: React + socket.io-client + app are bundled into app.js. SERVER_URL is
// injected at build time (empty = same-origin; absolute wss:// for a remote server).
//
//   npm run build:game                                              # → same-origin
//   SERVER_URL=https://battleship.onrender.com npm run build:game   # → wss to a remote server
import * as esbuild from "esbuild";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";

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

copyFileSync("public/style.css", `${OUT}/style.css`);

// Cache-busting: append a content hash to the app.js / style.css references in
// index.html so a deploy invalidates stale browser/PWA caches automatically
// (the static server ignores the query and still serves the file). Per-file
// hashes mean only the changed asset is re-fetched.
const hash = (path) => createHash("sha1").update(readFileSync(path)).digest("hex").slice(0, 8);
const appHash = hash(`${OUT}/app.js`);
const cssHash = hash("public/style.css");
const html = readFileSync("public/index.html", "utf8")
  .replace(/(href=")style\.css(")/g, `$1style.css?v=${cssHash}$2`)
  .replace(/(src=")app\.js(")/g, `$1app.js?v=${appHash}$2`);
writeFileSync(`${OUT}/index.html`, html);

console.log(`Game built → ${OUT}/  (SERVER_URL=${SERVER_URL || "(same-origin)"}, app=${appHash}, css=${cssHash})`);

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