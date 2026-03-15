import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Notification Center", () => {
  test("notification bell is visible on dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTitle("Notifications")).toBeVisible({ timeout: 8_000 });
  });

  test("shows unread badge count", async ({ page }) => {
    await page.goto("/");
    // The unread count is 1 from our mock
    const bell = page.getByTitle("Notifications");
    await expect(bell).toBeVisible({ timeout: 8_000 });
    // Badge should be visible near the bell
    await expect(page.locator("[title='Notifications']").locator("..").getByText("1")).toBeVisible({ timeout: 5_000 });
  });

  test("clicking bell opens notification panel", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Notifications").click();
    await expect(page.getByText("Notifications").first()).toBeVisible({ timeout: 5_000 });
  });

  test("shows notifications from API", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Notifications").click();
    await expect(page.getByText("Military event detected")).toBeVisible({ timeout: 5_000 });
  });

  test("shows Mark all read button when unread exist", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Notifications").click();
    await expect(page.getByText("Mark all read")).toBeVisible({ timeout: 5_000 });
  });

  test("mark all read triggers API call", async ({ page }) => {
    let readAllCalled = false;
    await page.route("**/api/v1/alerts/notifications/read-all", (route) => {
      readAllCalled = true;
      route.fulfill({ status: 204 });
    });

    await page.goto("/");
    await page.getByTitle("Notifications").click();
    await page.getByText("Mark all read").click();
    await page.waitForTimeout(500);
    expect(readAllCalled).toBe(true);
  });

  test("shows AI Insights section when anomalies exist", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Notifications").click();
    await expect(page.getByText("AI INSIGHTS")).toBeVisible({ timeout: 5_000 });
  });

  test("shows anomaly description", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Notifications").click();
    await expect(page.getByText(/volume spike/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("notification bell visible on all pages", async ({ page }) => {
    for (const path of ["/", "/alerts", "/feeds", "/plan", "/sitrep"]) {
      await page.goto(path);
      await expect(page.getByTitle("Notifications")).toBeVisible({ timeout: 8_000 });
    }
  });
});
