import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Alert Rules Page", () => {
  test("loads and shows heading", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByText("Alert Rules")).toBeVisible({ timeout: 8_000 });
  });

  test("displays existing rules from API", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByText("Military Alert")).toBeVisible({ timeout: 8_000 });
  });

  test("shows rule condition type badge", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByText(/category/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("shows delivery channel badges", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByText("in_app")).toBeVisible({ timeout: 8_000 });
  });

  test("toggle rule active status", async ({ page }) => {
    await page.goto("/alerts");
    const toggle = page.locator("[title*='click to']").first();
    await expect(toggle).toBeVisible({ timeout: 8_000 });
    await toggle.click();
  });

  test("delete rule with confirmation", async ({ page }) => {
    await page.goto("/alerts");
    page.on("dialog", (d) => d.accept());
    const deleteBtn = page.locator("[title='Delete']").first();
    await expect(deleteBtn).toBeVisible({ timeout: 8_000 });
    await deleteBtn.click();
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/alerts");
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });
});

test.describe("Alert Wizard — Full Flow", () => {
  test("opens wizard when clicking New Rule", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await expect(page.getByText("Name your alert rule")).toBeVisible({ timeout: 5_000 });
  });

  test("Step 0 — Name: requires non-empty name to advance", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await expect(page.getByText("Name your alert rule")).toBeVisible({ timeout: 5_000 });

    // Next should be disabled with empty name
    const nextBtn = page.getByText("Next →");
    await nextBtn.click();
    // Should still be on step 0 — condition step heading not visible
    await expect(page.getByText("Choose a condition type")).not.toBeVisible();

    // Fill name and advance
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Test Alert");
    await nextBtn.click();
    await expect(page.getByText("Choose a condition type")).toBeVisible({ timeout: 3_000 });
  });

  test("Step 1 — Condition: shows all 6 condition types", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Test");
    await page.getByText("Next →").click();

    for (const label of ["Severity Level", "Event Category", "Keyword Match", "Data Source", "Geographic Region", "Composite Rule"]) {
      await expect(page.getByText(label)).toBeVisible({ timeout: 3_000 });
    }
  });

  test("Step 2 — Severity parameters: shows severity chips", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Test");
    await page.getByText("Next →").click();

    // Select Severity Level
    await page.getByText("Severity Level").click();
    await page.getByText("Next →").click();

    // Should see severity chips
    for (const sev of ["critical", "high", "medium"]) {
      await expect(page.getByText(sev, { exact: true }).first()).toBeVisible({ timeout: 3_000 });
    }
  });

  test("Step 2 — Category parameters: shows category chips", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Test");
    await page.getByText("Next →").click();

    // Select Event Category
    await page.getByText("Event Category").click();
    await page.getByText("Next →").click();

    // Should see category chips
    await expect(page.getByText("environment").first()).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("military").first()).toBeVisible({ timeout: 3_000 });
  });

  test("Step 2 — Keyword parameters: shows keyword input", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Test");
    await page.getByText("Next →").click();

    await page.getByText("Keyword Match").click();
    await page.getByText("Next →").click();

    const input = page.getByPlaceholder('"nuclear test" or "cyber attack"');
    await expect(input).toBeVisible({ timeout: 3_000 });
  });

  test("completes full wizard — severity alert", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();

    // Step 0 — Name
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Critical Alerts");
    await page.getByText("Next →").click();

    // Step 1 — Condition: Severity
    await page.getByText("Severity Level").click();
    await page.getByText("Next →").click();

    // Step 2 — Parameters: select critical
    await page.getByText("critical", { exact: true }).first().click();
    await page.getByText("Next →").click();

    // Step 3 — Delivery: in_app should be default selected
    await expect(page.getByText("In-App Notifications")).toBeVisible({ timeout: 3_000 });
    await page.getByText("Next →").click();

    // Step 4 — Configure: in-app needs no config
    await expect(page.getByText(/no extra configuration/i)).toBeVisible({ timeout: 3_000 });
    await page.getByText("Next →").click();

    // Step 5 — Frequency: real-time default
    await expect(page.getByText("Real-time")).toBeVisible({ timeout: 3_000 });
    await page.getByText("Next →").click();

    // Step 6 — Review
    await expect(page.getByText("Review your alert rule")).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText("Critical Alerts")).toBeVisible();

    // Create
    await page.getByText("Create Rule").click();
    // Should return to rule list
    await expect(page.getByText("Alert Rules").first()).toBeVisible({ timeout: 5_000 });
  });

  test("completes full wizard — keyword + email alert", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();

    // Step 0 — Name
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Nuclear Monitor");
    await page.getByText("Next →").click();

    // Step 1 — Keyword Match
    await page.getByText("Keyword Match").click();
    await page.getByText("Next →").click();

    // Step 2 — Enter keyword
    await page.getByPlaceholder('"nuclear test" or "cyber attack"').fill("nuclear");
    await page.getByText("Next →").click();

    // Step 3 — Delivery: add email
    await page.getByText("Email Alerts").click();
    await page.getByText("Next →").click();

    // Step 4 — Configure email
    await page.getByPlaceholder("alerts@example.com").fill("test@test.com");
    await page.getByText("Next →").click();

    // Step 5 — Frequency: select hourly
    await page.getByText("Hourly Digest").click();
    await page.getByText("Next →").click();

    // Step 6 — Review
    await expect(page.getByText("Review your alert rule")).toBeVisible({ timeout: 3_000 });
    await page.getByText("Create Rule").click();
    await expect(page.getByText("Alert Rules").first()).toBeVisible({ timeout: 5_000 });
  });

  test("cancel exits wizard", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await expect(page.getByText("Name your alert rule")).toBeVisible({ timeout: 5_000 });

    await page.getByText("Cancel").click();
    await expect(page.getByText("Name your alert rule")).not.toBeVisible();
  });

  test("back button navigates to previous step", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByText("+ New Rule").click();
    await page.getByPlaceholder("e.g. Critical Earthquake Alert").fill("Test");
    await page.getByText("Next →").click();

    await expect(page.getByText("Choose a condition type")).toBeVisible({ timeout: 3_000 });
    await page.getByText("← Back").click();
    await expect(page.getByText("Name your alert rule")).toBeVisible({ timeout: 3_000 });
  });
});
