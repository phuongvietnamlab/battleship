// Builds the real game into dist/ as a self-contained Instant Games bundle.
// No CDN: React + socket.io-client + app are bundled into app.js. SERVER_URL is
// injected at build time (empty = same-origin for local dev; absolute wss:// for FB).
//
//   npm run build:game                                          # → same-origin (local preview)
//   SERVER_URL=https://battleship.onrender.com npm run build:game   # → wss to Render, for FB upload
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
copyFileSync("public/fbapp-config.json", `${OUT}/fbapp-config.json`);

console.log(`Game built → ${OUT}/  (SERVER_URL=${SERVER_URL || "(same-origin)"})`);
console.log("FB upload: zip the CONTENTS of dist/ (index.html must be at the ZIP top level).");
