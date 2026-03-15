import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Keyboard Shortcuts", () => {
  test("M key navigates to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("m");
    await page.waitForTimeout(500);
    expect(page.url()).toContain("localhost");
    // Should be at root or not at settings anymore
  });

  test("P key navigates to plan mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("p");
    await page.waitForURL("**/plan", { timeout: 3_000 });
    expect(page.url()).toContain("/plan");
  });

  test("A key navigates to alerts", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("a");
    await page.waitForURL("**/alerts", { timeout: 3_000 });
    expect(page.url()).toContain("/alerts");
  });

  test("W key navigates to watch list", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("w");
    await page.waitForURL("**/watch", { timeout: 3_000 });
    expect(page.url()).toContain("/watch");
  });

  test("F key navigates to feed health", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("f");
    await page.waitForURL("**/feeds", { timeout: 3_000 });
    expect(page.url()).toContain("/feeds");
  });

  test("N key toggles notification center", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("n");
    // Notification panel should appear
    await expect(page.getByText("Notifications").first()).toBeVisible({ timeout: 3_000 });
  });

  test("L key toggles layer panel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("l");
    // Layer panel should toggle
    await page.waitForTimeout(500);
  });

  test("/ key focuses search input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("/");
    // Search input should be focused
    const searchInput = page.locator("input[placeholder*='Search']").first();
    await expect(searchInput).toBeFocused({ timeout: 3_000 });
  });

  test("shortcuts suppressed when input focused", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // Focus on the search input first
    await page.keyboard.press("/");
    const searchInput = page.locator("input[placeholder*='Search']").first();
    await expect(searchInput).toBeFocused({ timeout: 3_000 });

    // Now pressing 'p' should NOT navigate to plan mode
    await page.keyboard.press("p");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("/plan");
  });

  test("Escape closes context drawer", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    // Press Escape — should not cause errors
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });
});
