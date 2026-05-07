import { expect, test } from "@playwright/test";

// Practice mode is the easiest happy-path E2E since it doesn't need a
// real backend until POST /history/practice on finish. The "save to
// history" toggle is hidden for unauthenticated users by design, so
// we assert that gate too.
test.describe("practice page", () => {
  test("renders the practice route without auth", async ({ page }) => {
    await page.goto("/practice");
    // Either the snippet loads or we land in error/loading; both should
    // surface the page title.
    await expect(
      page.getByRole("heading", { name: "Practice" }),
    ).toBeVisible();
  });

  test("does not show save-to-history for unauthenticated users", async ({ page }) => {
    await page.goto("/practice");
    // No checkbox is rendered for anon users (check by visible text).
    await expect(page.getByText("Save to history")).not.toBeVisible();
  });
});
