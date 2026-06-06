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
// Copy animated ocean background GIF for mobile (replaces CSS animations to avoid overheating)
try { copyFileSync("public/ocean-bg-mobile.gif", `${OUT}/ocean-bg-mobile.gif`); } catch(e) {}

console.log(`Game built → ${OUT}/  (SERVER_URL=${SERVER_URL || "(same-origin)"})`);
