import { expect, test, type Page } from "@playwright/test";
import { TEST_EXPERTE } from "./vorbereitung";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");

async function hochladen(page: Page) {
  await page.goto("/");
  await page.locator("#datei").setInputFiles({ name: "abrechnung.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kostenlos prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Ihr Einsparpotenzial" })).toBeVisible({ timeout: 15_000 });
}

async function zugangsdatum(page: Page, iso: string) {
  const feld = page.locator("#frage-meta\\.zugangAm");
  await feld.fill(iso);
  await feld.locator("xpath=ancestor::form").getByRole("button", { name: "Senden" }).click();
}

test("Stufe 1 → Freischalten → Stufe 2 → Abschluss", async ({ page }) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await hochladen(page);

  // Demo deutlich gekennzeichnet
  await expect(page.getByRole("note")).toContainText("Demo-Modus");

  // Stufe 1.1: Fehlerpotenzial
  await expect(page.getByText("1.1 Fehlerpotenzial")).toBeVisible();
  await expect(page.getByText("1.236,44 €")).toBeVisible();

  // Widerspruchsfrist: unmögliches Datum wird verständlich abgewiesen …
  await zugangsdatum(page, "2025-11-20");
  await expect(page.getByRole("alert").filter({ hasText: "vor dem Datum der Abrechnung" })).toBeVisible();
  // … gültiges Datum ergibt die Frist (Abrechnung vom 25.11.2025, Zugang 28.11.2025 → Einwände bis 28.11.2026)
  await zugangsdatum(page, "2025-11-28");
  await expect(page.getByText("28.11.2026")).toBeVisible();
  await expect(page.getByText("eingehalten", { exact: true })).toBeVisible();

  // Stufe 1.2: Kosten und Vergleich
  await expect(page.getByText("Nachzahlung", { exact: true })).toBeVisible();
  await expect(page.getByText("Nachzahlung", { exact: true }).locator("..")).toContainText("1.214,88 €");
  await expect(page.getByText(/Quelle: Deutscher Mieterbund, Betriebskostenspiegel für Deutschland, Abrechnungsjahr 2024/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Müll und Straßenreinigung" })).toBeVisible();

  // Stufe 2 ist vor dem Freischalten nicht einmal im Quelltext
  expect(await page.content()).not.toContain("Vorauszahlungen Heizkosten prüfen");
  expect(await page.content()).not.toContain("Lösungsvorschlag");

  // Freischalten
  await page.getByRole("button", { name: "Jetzt freischalten" }).click();
  await expect(page.getByRole("heading", { name: "Auffälligkeiten und Lösungsvorschläge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vorauszahlungen Heizkosten prüfen" })).toBeVisible();
  await expect(page.getByText("Lösungsvorschlag").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zusammenfassung" })).toBeVisible();
  await expect(page.getByText(/^Wir haben Ihre Abrechnung 2024 anhand von \d+ Prüfregeln untersucht/)).toBeVisible();

  // Abschluss: Anschreiben an die Hausverwaltung
  await expect(page.locator("#anschreiben")).toHaveValue(/^Sehr geehrte Damen und Herren,/);
  await expect(page.getByRole("link", { name: "Im E-Mail-Programm öffnen" })).toHaveAttribute("href", /^mailto:\?subject=Betriebskostenabrechnung%202024/);

  // Keine Emojis und keine Markdown-Reste auf der Seite
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(text).not.toMatch(/\*\*/);

  // Abschluss: Beratung anfragen – erst Einwilligung, dann gesendet
  await page.locator("#beratung-name").fill("Erika Musterfrau");
  await page.locator("#beratung-email").fill("erika@example.org");
  await page.getByRole("button", { name: "Beratung anfragen" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "kontaktieren dürfen" })).toBeVisible();
  await page.locator("#beratung-einwilligung").check();
  await page.getByRole("button", { name: "Beratung anfragen" }).click();
  await expect(page.getByText("Vielen Dank. Wir haben Ihre Anfrage erhalten")).toBeVisible();

  expect(fehler).toEqual([]);
});

test("Beratungsanfrage erscheint im Prüfbereich", async ({ page, browser }) => {
  test.skip(test.info().project.name.endsWith("handy"), "Prüfbereich ist für den Desktop gedacht");
  await hochladen(page);
  await page.getByRole("button", { name: "Jetzt freischalten" }).click();
  await page.locator("#beratung-name").fill("Max Prüfling");
  await page.locator("#beratung-email").fill("max@example.org");
  await page.locator("#beratung-einwilligung").check();
  await page.getByRole("button", { name: "Beratung anfragen" }).click();
  await expect(page.getByText("Vielen Dank")).toBeVisible();

  const intern = await (await browser.newContext()).newPage();
  await intern.goto(new URL("/intern/anmelden", page.url()).toString());
  await intern.getByLabel("E-Mail").fill(TEST_EXPERTE.email);
  await intern.getByLabel("Passwort").fill(TEST_EXPERTE.passwort);
  await intern.getByRole("button", { name: "Anmelden" }).click();
  await intern.getByRole("link", { name: "Beratungsanfragen" }).click();
  await expect(intern.getByText("Max Prüfling")).toBeVisible();
  await expect(intern.getByText("max@example.org")).toBeVisible();
});

test("Verspätete Abrechnung: die ganze Nachzahlung wird zum sicheren Einsparpotenzial", async ({ page }) => {
  await hochladen(page);
  // Abrechnung 2024 hätte bis 31.12.2025 zugehen müssen
  await zugangsdatum(page, "2026-01-15");
  await expect(page.getByText("Sicheres Einsparpotenzial").locator("..")).toContainText("1.214,88 €");
  await expect(page.getByText(/versäumt – eine Nachforderung ist grundsätzlich ausgeschlossen/)).toBeVisible();
});
