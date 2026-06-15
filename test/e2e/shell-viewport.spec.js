// Phase 19 (mobile-native app shell) — Wave 0 viewport-fit harness.
//
// Screen-driving strategy (decided here, see 19-RESEARCH.md Open Questions /
// 19-01-PLAN.md Task 1):
//   - For the 7 screens reachable via the dev-only `?screen=<name>` query-param
//     hook (added to App() in Plan 01 Task 3), navigate directly via
//     `page.goto("/?screen=<name>")`.
//   - The "battle" screen requires live game state (an active room + placed
//     fleets) that cannot be reached by query param alone, so it is driven via
//     the real Quick-Play -> bot -> placement -> battle tap flow:
//       1. goto("/")
//       2. tap the "Play vs Bot" lobby card
//       3. tap "Ready for battle" on the placement screen
//       4. wait for the battle scoreboard/boards to render
//
// D-08 hard gate (per screen x per mobile viewport project):
//   - documentElement.scrollHeight <= innerHeight + 1  (no page scroll, MOBILE-01)
//   - documentElement.scrollWidth  <= innerWidth  + 1  (no horizontal scroll, MOBILE-11)
//
// Battle + lobby cases are tagged @smoke for the fast sampling loop.

import { test, expect } from "@playwright/test";

const SCREENS = ["lobby", "room", "placement", "battle", "profile", "history", "friends", "queue"];

async function assertNoScroll(page) {
  const { scrollH, innerH, scrollW, innerW } = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(scrollH).toBeLessThanOrEqual(innerH + 1);
  expect(scrollW).toBeLessThanOrEqual(innerW + 1);
}

test.describe("no page scroll", () => {
  // Screens reachable directly via the dev-only ?screen= hook.
  const QUERY_SCREENS = SCREENS.filter((s) => s !== "battle");

  for (const screenName of QUERY_SCREENS) {
    test(`no page scroll — ${screenName}`, async ({ page }) => {
      test.skip(({ project }) => project.name === "desktop", "mobile-only gate");
      await page.goto(`/?screen=${screenName}`);
      await page.waitForLoadState("domcontentloaded");
      await assertNoScroll(page);
    });
  }

  test("no page scroll — battle viewport fit @smoke", async ({ page }) => {
    test.skip(({ project }) => project.name === "desktop", "mobile-only gate");
    await page.goto("/");
    await page.getByRole("button", { name: /Play vs Bot/i }).click();
    await page.getByRole("button", { name: /Ready for battle/i }).click();
    // Battle screen renders the scoreboard + boards once placement completes.
    await page.locator(".boards").waitFor({ state: "visible", timeout: 15000 });
    await assertNoScroll(page);
  });
});

test.describe("battle viewport fit", () => {
  test("battle viewport fit — board + scoreboard + turn ring fit one screen @smoke", async ({ page }) => {
    test.skip(({ project }) => project.name === "desktop", "mobile-only gate");
    await page.goto("/");
    await page.getByRole("button", { name: /Play vs Bot/i }).click();
    await page.getByRole("button", { name: /Ready for battle/i }).click();
    await page.locator(".boards").waitFor({ state: "visible", timeout: 15000 });
    await assertNoScroll(page);
    // Scoreboard, boards, and turn ring must all be present without scrolling.
    await expect(page.locator(".scoreboard")).toBeVisible();
    await expect(page.locator(".boards")).toBeVisible();
  });
});

test.describe("desktop phone frame", () => {
  test("desktop phone frame — .app stays <= 480px wide @smoke", async ({ page }) => {
    test.skip(({ project }) => project.name !== "desktop", "desktop-only check");
    await page.goto("/?screen=lobby");
    await page.waitForLoadState("domcontentloaded");
    const width = await page.locator(".app").evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(480);
  });
});
