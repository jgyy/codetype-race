import { expect, test } from "@playwright/test";

test.describe("practice page", () => {
    test("renders the practice route without auth", async ({ page }) => {
        await page.goto("/practice");
        await expect(
            page.getByRole("heading", { name: "Practice" }),
        ).toBeVisible();
    });

    test("does not show save-to-history for unauthenticated users", async ({ page }) => {
        await page.goto("/practice");
        await expect(page.getByText("Save to history")).not.toBeVisible();
    });
});
