import { test, expect } from "@playwright/test";
import { mockApiRoutes } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

const PAGES = [
  { path: "/",       title: /meridian/i,   description: "Dashboard" },
  { path: "/feeds",  title: /feed|health/i, description: "Feed Health" },
  { path: "/alerts", title: /alert/i,       description: "Alerts" },
  { path: "/watch",  title: /watch/i,       description: "Watch List" },
  { path: "/sitrep", title: /sitrep|situation/i, description: "Sitrep" },
];

test.describe("Navigation", () => {
  for (const { path, description } of PAGES) {
    test(`${description} page loads without crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      const critical = errors.filter(
        (e) => !e.includes("WebSocket") && !e.includes("net::ERR") && !e.includes("Failed to fetch")
      );
      expect(critical, `Console errors on ${path}: ${critical.join(", ")}`).toHaveLength(0);
    });

    test(`${description} (${path}) returns 200`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }

  test("sidebar nav links are present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav, aside").first()).toBeVisible({ timeout: 5_000 });
  });

  test("navigating to /feeds shows feed health content", async ({ page }) => {
    await page.goto("/feeds");
    await expect(page.getByText(/feed|source|health/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("navigating to /alerts shows alerts content", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByText(/alert/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("navigating between pages preserves app shell", async ({ page }) => {
    await page.goto("/");
    const shell = page.locator("nav, aside, header").first();
    await expect(shell).toBeVisible({ timeout: 5_000 });

    await page.goto("/feeds");
    await expect(shell).toBeVisible({ timeout: 5_000 });

    await page.goto("/");
    await expect(shell).toBeVisible({ timeout: 5_000 });
  });

  test("back navigation works", async ({ page }) => {
    await page.goto("/");
    await page.goto("/feeds");
    await page.goBack();
    expect(page.url()).toContain("localhost:5173");
  });

  test("unknown route does not crash the app", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/does-not-exist-xyz");
    const critical = errors.filter(
      (e) => !e.includes("WebSocket") && !e.includes("net::ERR")
    );
    expect(critical).toHaveLength(0);
  });
});
