import { expect, test } from "@playwright/test";
import { ALLE_REGELN } from "../../../packages/pruefkern/src/index";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");

test("Startseite passt ohne horizontales Scrollen auf den Bildschirm", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Nebenkosten\u00ADabrechnung/);
  const breite = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(breite[0]).toBeLessThanOrEqual(breite[1]!);
});

test("Hochladen: Knopf erklärt, was fehlt – danach Weiterleitung zur Prüfung", async ({ page }) => {
  await page.goto("/");
  const knopf = page.getByRole("button", { name: "Kostenlos prüfen" });
  const meldung = page.locator("form").getByRole("alert");

  // Ohne Datei: verständliche Meldung statt stumm ausgegrautem Knopf
  await knopf.click();
  await expect(meldung).toContainText("Bitte wählen Sie zuerst Ihre Abrechnung aus");

  await page.locator("#datei").setInputFiles({ name: "abrechnung.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText("✓ abrechnung.pdf")).toBeVisible();

  // Ohne Einwilligung
  await knopf.click();
  await expect(meldung).toContainText("einverstanden");

  await page.getByRole("checkbox").check();
  await expect(meldung).toHaveCount(0);
  await knopf.click();

  await expect(page).toHaveURL(/\/fall\/[0-9a-f-]{36}#[\w-]{40,}$/);
  // Ohne API-Schlüssel und mit Freigabepflicht geht der Fall an die Experten
  await expect(page.getByRole("heading", { name: "Ihre Abrechnung ist bei unseren Experten" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Bitte speichern Sie diesen Link")).toBeVisible();
});

test("Dateiauswahl liegt über der ganzen Ablagefläche (Antippen öffnet den Dialog)", async ({ page }) => {
  await page.goto("/#pruefen");
  const flaeche = page.locator("#datei").locator("..");
  const [waehler] = await Promise.all([page.waitForEvent("filechooser"), flaeche.click({ position: { x: 20, y: 20 } })]);
  expect(waehler.isMultiple()).toBe(false);
});

test("Startseite: 3D-Szene, Erklärvideo und Prüfregeln", async ({ page }) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto("/");
  // Szene ist geladen – oder zeigt bei fehlendem WebGL den Ersatz-Hintergrund
  await expect(page.locator('[role="img"][data-bereit="true"], [role="img"][data-ohne-webgl="true"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('video[src="/video/erklaervideo.mp4"]')).toHaveCount(1);
  // Anzahl aus dem Regelwerk – nie von Hand eintragen
  await expect(page.locator("#regeln li")).toHaveCount(ALLE_REGELN.length);
  await expect(page.getByText("Regeln geprüft").locator("..")).toContainText(String(ALLE_REGELN.length));
  expect(fehler).toEqual([]);
});

test("Hell/Dunkel-Schalter wirkt und bleibt nach dem Neuladen erhalten", async ({ page }) => {
  await page.goto("/");
  const hintergrund = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const vorher = await hintergrund();
  await page.getByRole("button", { name: "Hell- oder Dunkelmodus umschalten" }).click();
  const nachher = await hintergrund();
  expect(nachher).not.toBe(vorher);
  await page.reload();
  expect(await hintergrund()).toBe(nachher);
});

test("getarnte Datei wird mit verständlicher Meldung abgelehnt", async ({ page }) => {
  await page.goto("/");
  await page.locator("#datei").setInputFiles({ name: "abrechnung.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>nope</html>") });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kostenlos prüfen" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("PDF oder ein Foto");
  await expect(page).toHaveURL("/");
});

test("Link ohne Token zeigt keinen Fall", async ({ page }) => {
  await page.goto("/fall/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("Dieser Link ist unvollständig")).toBeVisible();
});

test("API verweigert Zugriff mit falschem Token und setzt Sicherheits-Header", async ({ request }) => {
  const upload = await request.post("/api/faelle", {
    multipart: { datei: { name: "a.pdf", mimeType: "application/pdf", buffer: PDF }, einwilligung: "ja" },
  });
  expect(upload.status()).toBe(201);
  const { id, token } = (await upload.json()) as { id: string; token: string };

  const falsch = await request.get(`/api/faelle/${id}`, { headers: { "x-zugang": "falsch" } });
  expect(falsch.status()).toBe(404);
  const richtig = await request.get(`/api/faelle/${id}`, { headers: { "x-zugang": token } });
  expect(richtig.status()).toBe(200);
  const daten = await richtig.json();
  expect(Object.keys(daten).sort()).toEqual(["erstelltAm", "id", "status"]);
  expect(richtig.headers()["x-frame-options"]).toBe("DENY");
  expect(richtig.headers()["cache-control"]).toContain("no-store");
});
