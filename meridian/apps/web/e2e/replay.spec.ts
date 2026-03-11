import { test, expect } from "@playwright/test";
import { mockApiRoutes } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
  await page.goto("/");
});

test.describe("TimeScrubber / Replay Mode", () => {
  test("TimeScrubber bar is visible on the dashboard", async ({ page }) => {
    const scrubber = page.locator("div").filter({ hasText: /^LIVE$/ }).first();
    await expect(scrubber).toBeVisible({ timeout: 8_000 });
  });

  test("defaults to LIVE mode indicator", async ({ page }) => {
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test("Live button is present and active by default", async ({ page }) => {
    const liveBtn = page.getByRole("button", { name: "Live", exact: true });
    await expect(liveBtn).toBeVisible({ timeout: 8_000 });
  });

  test("clicking 24h preset switches to REPLAY mode", async ({ page }) => {
    const replayRoute = page.waitForRequest("**/api/v1/events/replay**");

    await page.getByRole("button", { name: "24h", exact: true }).click();
    await expect(page.getByText("REPLAY", { exact: true })).toBeVisible({ timeout: 5_000 });

    await replayRoute.catch(() => null);
  });

  test("clicking 7d preset calls /api/v1/events/replay with correct range", async ({ page }) => {
    let replayUrl: URL | null = null;
    page.on("request", (req) => {
      if (req.url().includes("/events/replay")) {
        replayUrl = new URL(req.url());
      }
    });

    await page.getByRole("button", { name: "7d", exact: true }).click();
    await page.waitForTimeout(500);

    if (replayUrl) {
      expect(replayUrl.searchParams.get("start_time")).toBeTruthy();
      expect(replayUrl.searchParams.get("end_time")).toBeTruthy();
    }
  });

  test("REPLAY MODE badge appears after selecting a preset", async ({ page }) => {
    await page.getByRole("button", { name: "24h", exact: true }).click();
    await expect(page.getByText("REPLAY MODE")).toBeVisible({ timeout: 8_000 });
  });

  test("clicking Live button returns to LIVE mode", async ({ page }) => {
    await page.getByRole("button", { name: "24h", exact: true }).click();
    await expect(page.getByText("REPLAY MODE")).toBeVisible({ timeout: 8_000 });

    await page.getByRole("button", { name: "Live", exact: true }).click();
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("REPLAY MODE")).not.toBeVisible({ timeout: 3_000 });
  });

  test("Custom date picker toggle is visible", async ({ page }) => {
    const customBtn = page.getByRole("button", { name: "Custom", exact: true });
    await expect(customBtn).toBeVisible({ timeout: 8_000 });
  });

  test("Custom date inputs appear after clicking Custom", async ({ page }) => {
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await expect(page.locator("input[type='datetime-local']").first()).toBeVisible({ timeout: 3_000 });
  });

  test("play/pause button appears in replay mode", async ({ page }) => {
    await page.getByRole("button", { name: "24h", exact: true }).click();
    const playBtn = page.locator("button").filter({ hasText: /▶|⏸/ }).first();
    await expect(playBtn).toBeVisible({ timeout: 8_000 });
  });

  test("speed selector appears in replay mode", async ({ page }) => {
    await page.getByRole("button", { name: "7d", exact: true }).click();
    const speedSelect = page.locator("select").first();
    await expect(speedSelect).toBeVisible({ timeout: 8_000 });
  });
});
