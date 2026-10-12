import { defineConfig } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx tsx src/server/index.ts",
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(PORT),
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/codetogather",
      REDIS_URL: "redis://127.0.0.1:6379",
      SESSION_SECRET: "e2e-session-secret-that-is-at-least-32-chars",
    },
  },
});
