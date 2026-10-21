import { defineConfig, devices } from "@playwright/test";

// The cloud dev container ships Chromium at /opt/pw-browsers; elsewhere run `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: { executablePath },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
  webServer: {
    command: "npx vite --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    env: { VITE_SUPABASE_URL: "https://test-project.supabase.co", VITE_SUPABASE_ANON_KEY: "test-anon-key" },
  },
});
