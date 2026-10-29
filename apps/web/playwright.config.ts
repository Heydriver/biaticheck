import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const chromiumPfad = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/vorbereitung.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: chromiumPfad ? { executablePath: chromiumPfad } : undefined,
  },
  projects: [
    { name: "handy", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://biaticheck:biaticheck@localhost:5432/biaticheck_test",
      UPLOAD_DIR: "./.daten/e2e",
      ANTHROPIC_API_KEY: "",
      FREIGABE_ERFORDERLICH: "true",
      UPLOADS_PRO_STUNDE: "100",
      DATEI_SCHLUESSEL: Buffer.alloc(32, 9).toString("base64"),
    },
  },
});
