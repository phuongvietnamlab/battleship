// Phase 19 (mobile-native app shell) — i18n parity check (MOBILE-09).
//
// public/app.jsx is JSX bundled for the browser (imports react/socket.io-client),
// so it cannot be `import`-ed directly in this Node/Vitest environment. The I18N
// object is a flat-key literal inside app.jsx (en: {...}, vi: {...}); we parse the
// source text and extract the `shell.*`-prefixed key sets from each block, then
// assert they match exactly.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsxPath = path.join(__dirname, "..", "public", "app.jsx");
const source = readFileSync(appJsxPath, "utf8");

function extractI18nBlock(source, blockName) {
  // Find `  en: {` / `  vi: {` and capture up to the matching closing `  },`.
  const startMarker = new RegExp(`\\n  ${blockName}: \\{`);
  const startMatch = startMarker.exec(source);
  if (!startMatch) throw new Error(`Could not find I18N.${blockName} block in app.jsx`);
  const blockStart = startMatch.index + startMatch[0].length;
  const endMarker = /\n  \},/;
  endMarker.lastIndex = blockStart;
  const endMatch = endMarker.exec(source.slice(blockStart));
  if (!endMatch) throw new Error(`Could not find end of I18N.${blockName} block in app.jsx`);
  return source.slice(blockStart, blockStart + endMatch.index);
}

function extractShellKeys(blockText) {
  // Matches `"shell.xxx":` style keys.
  const keyRegex = /"(shell\.[a-zA-Z0-9_]+)"\s*:/g;
  const keys = new Set();
  let m;
  while ((m = keyRegex.exec(blockText))) keys.add(m[1]);
  return keys;
}

describe("i18n shell.* key parity (MOBILE-09)", () => {
  const enBlock = extractI18nBlock(source, "en");
  const viBlock = extractI18nBlock(source, "vi");

  const enKeys = extractShellKeys(enBlock);
  const viKeys = extractShellKeys(viBlock);

  it("EN I18N has at least one shell.* key", () => {
    expect(enKeys.size).toBeGreaterThan(0);
  });

  it("VI I18N has at least one shell.* key", () => {
    expect(viKeys.size).toBeGreaterThan(0);
  });

  it("EN and VI expose the same shell.* key set", () => {
    expect([...enKeys].sort()).toEqual([...viKeys].sort());
  });

  it("does not define shell.logToggle (D-07: battle log removed entirely)", () => {
    expect(enKeys.has("shell.logToggle")).toBe(false);
    expect(viKeys.has("shell.logToggle")).toBe(false);
  });
});
