import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const dbPath = path.resolve(__dirname, "../backend/data/e2e.db");

export default defineConfig({
  testDir: "./e2e",
  // All tests share the single "user" board, so run serially.
  workers: 1,
  use: { baseURL: "http://localhost:8100" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } }],
  webServer: {
    command: `npm run build && rm -f ${dbPath} && cd ../backend && uv run uvicorn app.main:app --port 8100`,
    url: "http://localhost:8100/api/health",
    env: { DB_PATH: dbPath },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
