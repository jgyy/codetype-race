import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("renders the headline and the join form", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "CodeType Race" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("ROOM CODE")).toBeVisible();
    await expect(page.getByPlaceholder("display name")).toBeVisible();
    await expect(page.getByLabel("Join as spectator")).toBeVisible();
  });

  test("links out to host, practice, and daily", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Sign in/ })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Start practice/ }),
    ).toBeVisible();
  });
});
