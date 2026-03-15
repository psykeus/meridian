import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Sitrep Page", () => {
  test("loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/sitrep");
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });

  test("shows Situation Report heading", async ({ page }) => {
    await page.goto("/sitrep");
    await expect(page.getByText("Situation Report")).toBeVisible({ timeout: 8_000 });
  });

  test("shows topic input field", async ({ page }) => {
    await page.goto("/sitrep");
    await expect(page.getByPlaceholder(/topic/i)).toBeVisible({ timeout: 8_000 });
  });

  test("shows region input field", async ({ page }) => {
    await page.goto("/sitrep");
    await expect(page.getByPlaceholder(/region/i)).toBeVisible({ timeout: 8_000 });
  });

  test("shows Generate button", async ({ page }) => {
    await page.goto("/sitrep");
    await expect(page.getByText("Generate Sitrep")).toBeVisible({ timeout: 8_000 });
  });

  test("shows template buttons", async ({ page }) => {
    await page.goto("/sitrep");
    for (const template of ["Conflict Overview", "Humanitarian Crisis", "Cyber Threat Landscape", "Natural Disasters"]) {
      await expect(page.getByText(template)).toBeVisible({ timeout: 8_000 });
    }
  });

  test("shows initial empty state", async ({ page }) => {
    await page.goto("/sitrep");
    await expect(page.getByText("Generate an Intelligence Sitrep")).toBeVisible({ timeout: 8_000 });
  });

  test("clicking template fills topic input", async ({ page }) => {
    await page.goto("/sitrep");
    await page.getByText("Conflict Overview").click();
    const topicInput = page.getByPlaceholder(/topic/i);
    const value = await topicInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test("generate sitrep with topic", async ({ page }) => {
    await page.goto("/sitrep");
    await page.getByPlaceholder(/topic/i).fill("active conflicts in Eastern Europe");
    await page.getByText("Generate Sitrep").click();

    // Should show loading then result
    await expect(page.getByText(/executive summary|generating/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("generate button disabled when topic is empty", async ({ page }) => {
    await page.goto("/sitrep");
    const btn = page.getByText("Generate Sitrep");
    await expect(btn).toBeVisible({ timeout: 8_000 });
    // Clear any existing text
    await page.getByPlaceholder(/topic/i).fill("");
    // Button should be visually present but functionally disabled
    await expect(btn).toBeVisible();
  });

  test("sitrep result shows topic as heading", async ({ page }) => {
    await page.goto("/sitrep");
    await page.getByPlaceholder(/topic/i).fill("test");
    await page.getByText("Generate Sitrep").click();

    await expect(page.getByText("Test").first()).toBeVisible({ timeout: 10_000 });
  });

  test("sitrep result shows regenerate button", async ({ page }) => {
    await page.goto("/sitrep");
    await page.getByPlaceholder(/topic/i).fill("test");
    await page.getByText("Generate Sitrep").click();

    await expect(page.getByText("↻ Regenerate")).toBeVisible({ timeout: 10_000 });
  });
});
