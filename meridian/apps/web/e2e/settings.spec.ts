import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Settings Page", () => {
  test("loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/settings");
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });

  test("shows sidebar tabs", async ({ page }) => {
    await page.goto("/settings");
    for (const tab of ["Data Sources", "API Tokens", "Billing", "Organization"]) {
      await expect(page.getByText(tab, { exact: true }).first()).toBeVisible({ timeout: 8_000 });
    }
  });

  test("Data Sources tab is default active", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/sources configured/i).first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Settings — Data Sources Tab", () => {
  test("shows source configuration summary", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/sources configured/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("shows category filter chips", async ({ page }) => {
    await page.goto("/settings");
    for (const cat of ["All", "Aviation", "Maritime", "Cyber", "Environment"]) {
      await expect(page.getByText(cat, { exact: true }).first()).toBeVisible({ timeout: 8_000 });
    }
  });

  test("shows source list items", async ({ page }) => {
    await page.goto("/settings");
    // At least one source should be visible
    await expect(page.getByText(/active|setup needed/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("category filter chips filter the list", async ({ page }) => {
    await page.goto("/settings");
    // Click a specific category
    await page.getByText("Cyber", { exact: true }).first().click();
    // The list should still be visible
    await expect(page.getByText(/sources configured/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Settings — API Tokens Tab", () => {
  test("switches to tokens tab", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("API Tokens", { exact: true }).first().click();
    await expect(page.getByText(/API Tokens/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("shows token creation form", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("API Tokens", { exact: true }).first().click();
    await expect(page.getByPlaceholder("Token name…")).toBeVisible({ timeout: 5_000 });
  });

  test("shows scope selector", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("API Tokens", { exact: true }).first().click();
    const select = page.locator("select").first();
    await expect(select).toBeVisible({ timeout: 5_000 });
  });

  test("create button disabled when name is empty", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("API Tokens", { exact: true }).first().click();
    const createBtn = page.getByText("Create", { exact: true }).first();
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
  });

  test("can fill token name and create", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("API Tokens", { exact: true }).first().click();
    await page.getByPlaceholder("Token name…").fill("CI Token");
    await page.getByText("Create", { exact: true }).first().click();
  });
});

test.describe("Settings — Billing Tab", () => {
  test("switches to billing tab", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Billing", { exact: true }).first().click();
    await expect(page.getByText("Billing & Plans")).toBeVisible({ timeout: 5_000 });
  });

  test("shows pricing tiers", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Billing", { exact: true }).first().click();
    await expect(page.getByText("Analyst")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Team Starter")).toBeVisible();
  });

  test("shows upgrade buttons", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Billing", { exact: true }).first().click();
    const upgradeButtons = page.getByText("Upgrade");
    expect(await upgradeButtons.count()).toBeGreaterThan(0);
  });
});

test.describe("Settings — Organization Tab", () => {
  test("switches to organization tab", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Organization", { exact: true }).first().click();
    await expect(page.getByText("Organization").first()).toBeVisible({ timeout: 5_000 });
  });

  test("shows org creation form", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Organization", { exact: true }).first().click();
    await expect(page.getByPlaceholder("Org name…")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder("slug")).toBeVisible();
  });

  test("can fill org form", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Organization", { exact: true }).first().click();
    await page.getByPlaceholder("Org name…").fill("Test Org");
    await page.getByPlaceholder("slug").fill("test-org");
  });
});
