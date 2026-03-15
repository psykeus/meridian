import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Watch List Page", () => {
  test("loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/watch");
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });

  test("shows Watch List heading", async ({ page }) => {
    await page.goto("/watch");
    await expect(page.getByText("Watch List")).toBeVisible({ timeout: 8_000 });
  });

  test("shows plan rooms in sidebar", async ({ page }) => {
    await page.goto("/watch");
    await expect(page.getByText("Ukraine Ops")).toBeVisible({ timeout: 8_000 });
  });

  test("shows no-room-selected state initially", async ({ page }) => {
    await page.goto("/watch");
    await expect(page.getByText(/select a plan room/i)).toBeVisible({ timeout: 8_000 });
  });

  test("selecting a room shows watch list content", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    // Should now show the entity list or empty state
    await expect(page.getByText(/entities|No watch list/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("filter input is visible after selecting room", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    await expect(page.getByPlaceholder("Filter…")).toBeVisible({ timeout: 5_000 });
  });

  test("Add Entity button appears after selecting room", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    await expect(page.getByText("+ Add Entity")).toBeVisible({ timeout: 5_000 });
  });

  test("Add Entity form opens on click", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("+ Add Entity").click();

    await expect(page.getByPlaceholder("Friendly name…")).toBeVisible({ timeout: 3_000 });
    await expect(page.getByPlaceholder("MMSI / ICAO / keyword…")).toBeVisible();
  });

  test("Add Entity form — shows entity type selector", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("+ Add Entity").click();

    // Type select should be visible
    const select = page.locator("select").first();
    await expect(select).toBeVisible({ timeout: 3_000 });
  });

  test("Add Entity form — cancel closes form", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("+ Add Entity").click();
    await expect(page.getByPlaceholder("Friendly name…")).toBeVisible({ timeout: 3_000 });

    await page.getByText("Cancel", { exact: true }).click();
    await expect(page.getByPlaceholder("Friendly name…")).not.toBeVisible();
  });

  test("Add Entity form — submits new entity", async ({ page }) => {
    await page.goto("/watch");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("+ Add Entity").click();

    await page.getByPlaceholder("Friendly name…").fill("Test Vessel");
    await page.getByPlaceholder("MMSI / ICAO / keyword…").fill("MMSI:123456789");
    await page.getByText("Add", { exact: true }).first().click();
  });
});
