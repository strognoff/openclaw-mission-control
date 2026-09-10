import { test, expect } from "@playwright/test";

test.describe("Mission Control dashboard @smoke", () => {
  test("overview renders the header and tiles", async ({ page }) => {
    await page.goto("/");
    // The fox mascot is in the header.
    await expect(page.getByText("🦊").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /OpenClaw Mission Control/i })).toBeVisible();
    // The summary tile labels exist.
    await expect(page.getByText(/Online/i).first()).toBeVisible();
    await expect(page.getByText(/Working/i).first()).toBeVisible();
    await expect(page.getByText(/Idle/i).first()).toBeVisible();
    await expect(page.getByText(/Offline/i).first()).toBeVisible();
    // The live activity feed renders.
    await expect(page.getByText(/Live activity/i)).toBeVisible();
  });

  test("keys page renders the mint form", async ({ page }) => {
    await page.goto("/keys");
    await expect(page.getByRole("heading", { name: /Agent API keys/i })).toBeVisible();
    await expect(page.getByPlaceholder(/agentId/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Mint key/i })).toBeVisible();
  });
});