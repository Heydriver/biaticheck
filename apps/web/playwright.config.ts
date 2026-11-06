import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Zweiter Server für den vollständigen Auswertungsablauf: Demo-Auslesen, ohne Expertenfreigabe. */
const PORT_DEMO = 3101;
const chromiumPfad = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const gemeinsam = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://biaticheck:biaticheck@localhost:5432/biaticheck_test",
  ANTHROPIC_API_KEY: "",
  UPLOADS_PRO_STUNDE: "100",
  DATEI_SCHLUESSEL: Buffer.alloc(32, 9).toString("base64"),
};

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
    { name: "handy", testIgnore: /auswertung\.spec/, use: { ...devices["Pixel 7"] } },
    { name: "desktop", testIgnore: /auswertung\.spec/, use: { ...devices["Desktop Chrome"] } },
    { name: "auswertung-handy", testMatch: /auswertung\.spec/, use: { ...devices["Pixel 7"], baseURL: `http://localhost:${PORT_DEMO}` } },
    { name: "auswertung-desktop", testMatch: /auswertung\.spec/, use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT_DEMO}` } },
  ],
  webServer: [
    {
      // Produktivnahe Konfiguration: ohne API-Schlüssel landen Fälle bei den Experten
      command: `pnpm start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      env: { ...gemeinsam, UPLOAD_DIR: "./.daten/e2e", FREIGABE_ERFORDERLICH: "true" },
    },
    {
      // Testumgebung: Demo-Auslesen und Freischaltung im Testmodus (beides im Produktivbetrieb gesperrt)
      command: `pnpm start -p ${PORT_DEMO}`,
      url: `http://localhost:${PORT_DEMO}`,
      reuseExistingServer: false,
      env: {
        ...gemeinsam,
        NODE_ENV: "test",
        UPLOAD_DIR: "./.daten/e2e-demo",
        FREIGABE_ERFORDERLICH: "false",
        DEMO_AUSLESEN: "true",
        ZAHLUNG_MODUS: "test",
      },
    },
  ],
});
