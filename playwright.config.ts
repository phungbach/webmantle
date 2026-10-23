import { defineConfig, devices } from "@playwright/test";

// The e2e run uses its own port and data directory, never the development database.
const PORT = 3201;
const E2E_DATA = "data/e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx scripts/e2e-prepare.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      CMS_DATA_DIR: `${process.cwd()}/${E2E_DATA}`,
      DATABASE_URL: `file:${process.cwd()}/${E2E_DATA}/cms.db`,
      PREVIEW_SECRET: "e2e-only-preview-secret-that-is-long-enough-0123456789",
      SITE_URL: `http://localhost:${PORT}`,
      ADMIN_EMAIL: "e2e-admin@example.com",
      ADMIN_PASSWORD: "e2e-admin-password-123",
      ADMIN_NAME: "E2E Admin",
      CMS_FALLBACK_THEME_ID: "default",
    },
  },
});
