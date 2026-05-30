// Builds the T0 spike into dist-spike/ as a self-contained Instant Games bundle.
// SERVER_URL is injected at build time (esbuild define) — no hardcoded URL in source.
//
//   npm run build:spike                                  # → http://localhost:4000
//   SERVER_URL=https://battleship-spike.fly.dev npm run build:spike   # → wss to Fly
import * as esbuild from "esbuild";
import { mkdirSync, copyFileSync } from "fs";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";
const OUT = "dist-spike";

mkdirSync(OUT, { recursive: true });

await esbuild.build({
  entryPoints: ["public/spike/spike.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018"],
  outfile: `${OUT}/app.js`,
  define: { "process.env.SERVER_URL": JSON.stringify(SERVER_URL) },
});

copyFileSync("public/spike/index.html", `${OUT}/index.html`);
copyFileSync("public/spike/fbapp-config.json", `${OUT}/fbapp-config.json`);

console.log(`Spike built → ${OUT}/  (SERVER_URL=${SERVER_URL})`);
console.log("FB upload: zip the CONTENTS of dist-spike/ (index.html must be at the ZIP top level).");
