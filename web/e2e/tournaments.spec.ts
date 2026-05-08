import { expect, test } from "@playwright/test";

test.describe("tournaments list", () => {
    test("renders status tabs and a registering tournament row", async ({
        page,
    }) => {
        await page.route("**/tournaments?status=registering*", (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({
                    tournaments: [
                        {
                            id: "11111111-1111-4111-8111-111111111111",
                            name: "Friday 8pm",
                            size: 4,
                            language: "*",
                            difficulty: "any",
                            status: "registering",
                            startsAt: "2099-05-09T12:00:00.000Z",
                            registrationClosesAt: "2099-05-09T11:55:00.000Z",
                            seasonId: "2026-S2",
                            hostId: "h",
                            createdAt: "2026-05-08T00:00:00.000Z",
                            winnerId: null,
                        },
                    ],
                }),
            }),
        );
        await page.route("**/seasons/current*", (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ season: null, daysRemaining: null }),
            }),
        );

        await page.goto("/tournaments");
        await expect(
            page.getByRole("heading", { name: "Tournaments" }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "registering" })).toBeVisible();
        await expect(page.getByRole("button", { name: "running" })).toBeVisible();
        await expect(page.getByRole("button", { name: "finished" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Friday 8pm" })).toBeVisible();
    });

    test("empty state when no tournaments match the status", async ({
        page,
    }) => {
        await page.route("**/tournaments?status=registering*", (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ tournaments: [] }),
            }),
        );
        await page.route("**/seasons/current*", (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ season: null, daysRemaining: null }),
            }),
        );

        await page.goto("/tournaments");
        await expect(
            page.getByText("No registering tournaments."),
        ).toBeVisible();
    });
});
