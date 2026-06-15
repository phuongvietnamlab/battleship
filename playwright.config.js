// Phase 19 (mobile-native app shell) — Wave 0 Playwright harness.
// Verifies the D-08 hard gate: no page-level scroll + no horizontal scroll
// at the three mobile viewport presets, plus the desktop phone-frame check
// (MOBILE-08). See test/e2e/shell-viewport.spec.js for the assertions.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4000",
  },
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 640 } },
    },
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile-414",
      use: { ...devices["Desktop Chrome"], viewport: { width: 414, height: 896 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "node server.js",
    url: "http://localhost:4000/healthz",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
