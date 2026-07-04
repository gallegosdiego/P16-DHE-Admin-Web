import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const parsedBaseUrl = new URL(baseURL);
const webServerPort = parsedBaseUrl.port || (parsedBaseUrl.protocol === "https:" ? "443" : "80");
const isCi = process.env.CI === "true" || process.env.CI === "1";
const useWebServer = process.env.E2E_USE_WEBSERVER !== "false";
const webServerCommand = isCi
  ? `npm run build && npx next start -p ${webServerPort}`
  : `npx next dev -p ${webServerPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useWebServer
    ? {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !isCi,
        timeout: 180_000,
      }
    : undefined,
});
