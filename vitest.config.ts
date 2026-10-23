import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DATA_DIR = path.resolve(__dirname, "data", "test");

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@plugins": path.resolve(__dirname, "plugins/index.ts"),
      // server-only throws outside the React server runtime; tests run in plain Node.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globalSetup: ["tests/global-setup.ts"],
    // All tests share one SQLite database, so files run one after another.
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      CMS_DATA_DIR: TEST_DATA_DIR,
      DATABASE_URL: `file:${path.join(TEST_DATA_DIR, "cms.db")}`,
      PREVIEW_SECRET: "test-only-preview-secret-that-is-long-enough-0123456789",
      SITE_URL: "http://localhost:3000",
      // The tests use the stock themes in tests/fixtures/themes; "default" is their fallback.
      CMS_FALLBACK_THEME_ID: "default",
    },
  },
});
