import { test, expect } from "@playwright/test";
import { mockApiRoutes } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
  await page.goto("/feeds");
});

test.describe("Feed Health Page", () => {
  test("page loads without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForLoadState("domcontentloaded");
    const critical = errors.filter(
      (e) => !e.includes("WebSocket") && !e.includes("net::ERR")
    );
    expect(critical).toHaveLength(0);
  });

  test("feed health table or list is rendered", async ({ page }) => {
    await expect(
      page.locator("table, [role='table'], .feed-row").first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("shows known source IDs", async ({ page }) => {
    await expect(page.getByText(/usgs_earthquakes/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/nasa_firms/i)).toBeVisible({ timeout: 8_000 });
  });

  test("shows status badges", async ({ page }) => {
    await expect(page.getByText(/healthy/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("shows error status for failing feeds", async ({ page }) => {
    await expect(page.getByText(/error/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("shows stale status where applicable", async ({ page }) => {
    await expect(page.getByText(/stale/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("summary stats section is present", async ({ page }) => {
    await expect(
      page.locator("div, section").filter({ hasText: /total|active|feeds/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("feed display names are shown", async ({ page }) => {
    await expect(page.getByText(/USGS Earthquake|NASA FIRMS|GDACS/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("numeric columns render without crash (no toFixed errors)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    const numericErrors = errors.filter(
      (e) => e.includes("toFixed") || e.includes("Cannot read properties of null")
    );
    expect(numericErrors).toHaveLength(0);
  });
});
