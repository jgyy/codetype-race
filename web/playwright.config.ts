import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
    testDir: "./e2e",
    timeout: 30_000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [["list"]],
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
            command: "bun run dev",
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
