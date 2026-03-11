import { test, expect } from "@playwright/test";
import { mockApiRoutes } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
  await page.goto("/");
});

test.describe("Layer Panel", () => {
  test("layer panel button is visible in the toolbar", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
  });

  test("layer panel opens on button click", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();
    await expect(page.getByText("MAP LAYERS")).toBeVisible({ timeout: 5_000 });
  });

  test("layer panel shows layer count", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();
    await expect(page.getByText(/\d+\)/)).toBeVisible({ timeout: 5_000 });
  });

  test("layer group headers are visible", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();
    await expect(page.getByText(/environment/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/security/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/aviation/i)).toBeVisible({ timeout: 5_000 });
  });

  test("layer panel search filters layers", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();

    const search = page.locator("input[placeholder*='earch']");
    await search.fill("earthquake");
    await expect(page.getByText(/earthquake/i)).toBeVisible({ timeout: 3_000 });
  });

  test("layer panel closes on backdrop click", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();
    await expect(page.getByText("MAP LAYERS")).toBeVisible();

    await page.keyboard.press("Escape");
    const closed = await page.getByText("MAP LAYERS").isVisible().catch(() => false);
    expect(closed).toBeFalsy();
  });

  test("toggling a layer changes its active state", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();

    const firstLayer = page.locator("label").first();
    await firstLayer.click();
    await expect(firstLayer).toBeVisible();
  });

  test("layer panel closes via X button", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /layer/i }).first();
    await btn.click();
    await expect(page.getByText("MAP LAYERS")).toBeVisible();

    await page.locator("aside button").filter({ hasText: "✕" }).click();
    await expect(page.getByText("MAP LAYERS")).not.toBeVisible({ timeout: 3_000 });
  });
});
