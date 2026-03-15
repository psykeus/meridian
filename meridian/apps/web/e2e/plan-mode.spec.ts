import { test, expect } from "@playwright/test";
import { mockApiRoutes, filterCriticalErrors } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

test.describe("Plan Mode Page", () => {
  test("loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/plan");
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });

  test("shows Plan Rooms sidebar header", async ({ page }) => {
    await page.goto("/plan");
    await expect(page.getByText("Plan Rooms")).toBeVisible({ timeout: 8_000 });
  });

  test("displays plan rooms from API", async ({ page }) => {
    await page.goto("/plan");
    await expect(page.getByText("Ukraine Ops")).toBeVisible({ timeout: 8_000 });
  });

  test("shows + button to create new room", async ({ page }) => {
    await page.goto("/plan");
    const btn = page.getByTitle("New Plan Room");
    await expect(btn).toBeVisible({ timeout: 8_000 });
  });

  test("create room form appears on + click", async ({ page }) => {
    await page.goto("/plan");
    await page.getByTitle("New Plan Room").click();
    await expect(page.getByPlaceholder("Room name…")).toBeVisible({ timeout: 3_000 });
    await expect(page.getByPlaceholder("Description (optional)")).toBeVisible();
  });

  test("create room form — cancel hides form", async ({ page }) => {
    await page.goto("/plan");
    await page.getByTitle("New Plan Room").click();
    await expect(page.getByPlaceholder("Room name…")).toBeVisible({ timeout: 3_000 });
    await page.locator("button").filter({ hasText: "✕" }).first().click();
    await expect(page.getByPlaceholder("Room name…")).not.toBeVisible();
  });

  test("create room form — submits new room", async ({ page }) => {
    await page.goto("/plan");
    await page.getByTitle("New Plan Room").click();
    await page.getByPlaceholder("Room name…").fill("Test Room");
    await page.getByPlaceholder("Description (optional)").fill("A test room");
    await page.getByText("Create", { exact: true }).click();
  });

  test("Tracked Entities button is visible", async ({ page }) => {
    await page.goto("/plan");
    await expect(page.getByText("Tracked Entities")).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Plan Mode — Room Detail", () => {
  test("clicking a room shows detail tabs", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();

    for (const tab of ["Tasks", "Timeline", "Annotations", "Intel", "Members"]) {
      await expect(page.getByText(tab, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("shows export button", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await expect(page.getByText("↓ Export")).toBeVisible({ timeout: 5_000 });
  });

  test("export dropdown opens with format options", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("↓ Export").click();

    for (const fmt of ["Export as JSON", "Export as GEOJSON", "Export as KML"]) {
      await expect(page.getByText(fmt)).toBeVisible({ timeout: 3_000 });
    }
  });
});

test.describe("Plan Mode — Tasks Tab", () => {
  test("shows task input and add button", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Tasks", { exact: true }).first().click();

    await expect(page.getByPlaceholder("Add task…")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Add", { exact: true }).first()).toBeVisible();
  });

  test("displays existing tasks from API", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Tasks", { exact: true }).first().click();

    await expect(page.getByText("Monitor troop movements")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Update daily brief")).toBeVisible();
  });

  test("shows kanban columns", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Tasks", { exact: true }).first().click();

    await expect(page.getByText("TO MONITOR")).toBeVisible({ timeout: 5_000 });
  });

  test("can add a new task", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Tasks", { exact: true }).first().click();

    await page.getByPlaceholder("Add task…").fill("New recon task");
    await page.getByText("Add", { exact: true }).first().click();
  });

  test("AI Suggest button is visible", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Tasks", { exact: true }).first().click();

    await expect(page.getByText("AI Suggest").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Plan Mode — Timeline Tab", () => {
  test("shows timeline entry input", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Timeline", { exact: true }).first().click();

    await expect(page.getByPlaceholder("New entry title…")).toBeVisible({ timeout: 5_000 });
  });

  test("displays existing timeline entries", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Timeline", { exact: true }).first().click();

    await expect(page.getByText("Situation escalated")).toBeVisible({ timeout: 5_000 });
  });

  test("AI Summary button is visible", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Timeline", { exact: true }).first().click();

    await expect(page.getByText("AI Summary").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Plan Mode — Annotations Tab", () => {
  test("shows annotations from API", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Annotations", { exact: true }).first().click();

    await expect(page.getByText("HQ")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Plan Mode — Intel Tab", () => {
  test("shows intel note creation form", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Intel", { exact: true }).first().click();

    await expect(page.getByPlaceholder("Note title…")).toBeVisible({ timeout: 5_000 });
  });

  test("shows classification dropdown", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Intel", { exact: true }).first().click();

    const select = page.locator("select").first();
    await expect(select).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Plan Mode — Members Tab", () => {
  test("shows invite input", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Members", { exact: true }).first().click();

    await expect(page.getByPlaceholder("User ID to invite…")).toBeVisible({ timeout: 5_000 });
  });

  test("displays existing members", async ({ page }) => {
    await page.goto("/plan");
    await page.getByText("Ukraine Ops").click();
    await page.getByText("Members", { exact: true }).first().click();

    await expect(page.getByText(/User #1/)).toBeVisible({ timeout: 5_000 });
  });
});
