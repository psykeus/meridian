import { test, expect } from "@playwright/test";
import { mockApiRoutes } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Dashboard", () => {
  test("loads without error", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("map container is rendered", async ({ page }) => {
    await page.goto("/");
    const map = page.locator(".maplibregl-map, [class*='maplibregl']").first();
    await expect(map).toBeVisible({ timeout: 10_000 });
  });

  test("map canvas is present", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
  });

  test("tile style switcher button is visible", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator("button[title='Change map style']");
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("tile style switcher opens panel on click", async ({ page }) => {
    await page.goto("/");
    await page.locator("button[title='Change map style']").click();
    await expect(page.getByText("Dark")).toBeVisible();
    await expect(page.getByText("Satellite")).toBeVisible();
    await expect(page.getByText("Terrain")).toBeVisible();
    await expect(page.getByText("Streets")).toBeVisible();
  });

  test("tile style switcher closes after selecting a style", async ({ page }) => {
    await page.goto("/");
    await page.locator("button[title='Change map style']").click();
    await page.getByText("Light").click();
    await expect(page.getByText("Satellite")).not.toBeVisible();
  });

  test("TimeScrubber LIVE indicator is visible", async ({ page }) => {
    await page.goto("/");
    const live = page.getByText("LIVE", { exact: true });
    await expect(live).toBeVisible({ timeout: 8_000 });
  });

  test("TimeScrubber preset buttons are visible", async ({ page }) => {
    await page.goto("/");
    for (const label of ["6h", "24h", "7d", "30d"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 8_000 });
    }
  });

  test("panel grid area is rendered below the map", async ({ page }) => {
    await page.goto("/");
    const grid = page.locator(".react-grid-layout");
    await expect(grid).toBeVisible({ timeout: 8_000 });
  });

  test("no uncaught console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForTimeout(2000);
    const critical = errors.filter(
      (e) => !e.includes("WebSocket") && !e.includes("net::ERR")
    );
    expect(critical).toHaveLength(0);
  });
});
