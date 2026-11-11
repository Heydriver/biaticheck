import { expect, test, type Page } from "@playwright/test";
import { TEST_EXPERTE } from "./vorbereitung";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");
const ERGEBNIS = /Bis zu 13,57\s€ könnten falsch abgerechnet sein/;

async function hochladen(page: Page) {
  await page.goto("/");
  await page.locator("#datei").setInputFiles({ name: "abrechnung.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Kostenlos prüfen" }).click();
  await expect(page.getByRole("heading", { name: ERGEBNIS })).toBeVisible({ timeout: 15_000 });
}

async function zugangsdatum(page: Page, iso: string) {
  const feld = page.locator("#frage-meta\\.zugangAm");
  await feld.fill(iso);
  await feld.locator("xpath=ancestor::form").getByRole("button", { name: "Senden" }).click();
}

test("Ergebnis → Lösung ansehen → Empfehlung → Schreiben oder Experte", async ({ page }) => {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await hochladen(page);

  await expect(page.getByRole("note")).toContainText("Demo-Modus");
  // Einordnung: Vergleichswerte (Warmwasser, Kostenvergleich) und die zulässige Heizfläche zählen nicht als Fehler
  await expect(page.getByText("Wir haben einen Punkt mit begründetem Prüfbedarf gefunden.")).toBeVisible();
  // Unterlage fehlt noch → Einstufung „Prüfbedarf“
  await expect(page.getByText("Fehlerpotenzial:").locator("..")).toContainText("Prüfbedarf");
  // Prüfbedarf: die 1.222,87 € zählen erst, wenn sie belegt sind
  await expect(page.getByText(/Ein weiterer Punkt mit bis zu 1\.222,87\s€ prüfen wir, sobald Sie eine Unterlage nachreichen/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prüfbedarf: Wir brauchen noch eine Unterlage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vorauszahlungen Heizkosten: Prüfbedarf" })).toBeVisible();
  await expect(page.getByText(/Bitte bereitlegen:.*Abrechnung des Vorjahres\./)).toBeVisible();
  // Kontoauszüge und Mietkonto werden nicht mehr verlangt
  await expect(page.getByText(/Kontoausz|Mietkonto/)).toHaveCount(0);
  await expect(page.getByText("Ihre Nachzahlung").locator("..")).toContainText("1.214,88 €");
  const vergleich = page.getByText("Vergleich mit dem Bundesdurchschnitt", { exact: true }).locator("..");
  await expect(vergleich).toContainText("45 % über Durchschnitt");
  await expect(vergleich).toContainText("Deutscher Mieterbund");
  await expect(vergleich).toContainText("kein Nachweis eines Fehlers");
  await expect(page.getByText(/Gut zu wissen: (ein|\d+) Hinweise? ohne Fehlerverdacht/)).toBeVisible();

  // Eingangsdatum: unmögliches Datum wird verständlich abgewiesen, gültiges ergibt die Frist
  await zugangsdatum(page, "2025-11-20");
  await expect(page.getByRole("alert").filter({ hasText: "vor dem Datum der Abrechnung" })).toBeVisible();
  await zugangsdatum(page, "2025-11-28");
  await expect(page.getByText("Einspruch möglich").locator("..")).toContainText("bis 28.11.2026");

  // Eigene Angabe: 110 € im Monat gezahlt → 1.320 € statt angerechneter 1.176,41 € → sicherer Fehler 143,59 €
  await page.getByLabel("gültig ab, Zeile 1").fill("2024-01-01");
  await page.getByLabel("Heizkosten je Monat, Zeile 1").fill("110");
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await expect(page.getByRole("heading", { name: /143,59\s€ müssen Sie nicht bezahlen/ })).toBeVisible();
  // Belegter Fehler über 30 € → Einstufung „hoch“
  await expect(page.getByText("Fehlerpotenzial:").locator("..")).toContainText("hoch");
  await expect(page.getByRole("heading", { name: "Prüfbedarf: Wir brauchen noch eine Unterlage" })).toBeHidden();

  // Modell B: Fehler sind kostenlos sichtbar, Schritte und Schreiben erst nach dem Erledigen-Paket (nicht einmal im Quelltext)
  await expect(page.getByRole("heading", { name: "Das haben wir gefunden" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vorauszahlungen Heizkosten zu niedrig angerechnet" })).toBeVisible();
  const kostenlos = await page.locator("main").innerText();
  expect(kostenlos.length).toBeLessThan(3400);
  // Nachvollziehbar: konkrete Zahlen, Fundstelle und Grundlage je Punkt
  await expect(page.getByText("Wohneinheiten: 1 von 42")).toBeVisible();
  await expect(page.getByText(/In Ihrer Abrechnung: Seite 5 · Grundlage: § 2 Nr\. 15 BetrKV/)).toBeVisible();
  // Die abweichende Heizfläche steht nur noch unter „Gut zu wissen“ (eingeklappt)
  await expect(page.getByText("2,09 m² (2,5 %)")).toBeHidden();
  await page.getByText(/Gut zu wissen:/).click();
  await expect(page.getByText("2,09 m² (2,5 %)")).toBeVisible();
  expect(await page.content()).not.toContain("Unsere Empfehlung");
  expect(await page.content()).not.toContain("Sehr geehrte Damen und Herren");

  await page.getByRole("button", { name: /^Für 9,90\s€ erledigen$/ }).click();
  await expect(page.getByRole("heading", { name: "Schicken Sie das vorbereitete Schreiben an Ihre Hausverwaltung" })).toBeVisible();
  await expect(page.getByText("Senden Sie es bis spätestens 28.11.2026.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vorauszahlungen Heizkosten zu niedrig angerechnet" })).toBeVisible();
  // Offene Punkte sind eingeklappt
  await expect(page.getByText(/weitere Punkte prüfen wir mit Ihrem Mietvertrag/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dachrinnenreinigung" })).toBeHidden();

  // Keine Emojis, keine Markdown-Reste, wenig Text
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(text).not.toMatch(/\*\*/);
  expect(text.length).toBeLessThan(4600);

  // Weg 1: Schreiben
  await page.getByRole("button", { name: "Schreiben öffnen" }).click();
  await expect(page.locator("#anschreiben")).toHaveValue(/^Sehr geehrte Damen und Herren,/);
  await expect(page.getByRole("link", { name: "Per E-Mail senden" })).toHaveAttribute("href", /^mailto:\?subject=Betriebskostenabrechnung%202024/);

  // Weg 2: Experte – erst Einwilligung, dann gesendet
  await page.getByRole("button", { name: "Lieber vom Experten erledigen lassen" }).click();
  await page.locator("#beratung-name").fill("Erika Musterfrau");
  await page.locator("#beratung-email").fill("erika@example.org");
  await page.getByRole("button", { name: "Rückruf anfordern" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "kontaktieren dürfen" })).toBeVisible();
  await page.locator("#beratung-einwilligung").check();
  await page.getByRole("button", { name: "Rückruf anfordern" }).click();
  await expect(page.getByText("Danke, wir melden uns.")).toBeVisible();

  expect(fehler).toEqual([]);
});

test("Beratungsanfrage erscheint im Prüfbereich", async ({ page, browser }) => {
  test.skip(test.info().project.name.endsWith("handy"), "Prüfbereich ist für den Desktop gedacht");
  await hochladen(page);
  // Unter 30 € sicherer bzw. zu klärender Ersparnis ist das Erledigen-Paket kostenlos – kein Bezahlschritt
  await expect(page.getByRole("button", { name: /^Für 9,90\s€ erledigen$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Lieber vom Experten erledigen lassen" }).click();
  await page.locator("#beratung-name").fill("Max Prüfling");
  await page.locator("#beratung-email").fill("max@example.org");
  await page.locator("#beratung-einwilligung").check();
  await page.getByRole("button", { name: "Rückruf anfordern" }).click();
  await expect(page.getByText("Danke, wir melden uns.")).toBeVisible();

  const intern = await (await browser.newContext()).newPage();
  await intern.goto(new URL("/intern/anmelden", page.url()).toString());
  await intern.getByLabel("E-Mail").fill(TEST_EXPERTE.email);
  await intern.getByLabel("Passwort").fill(TEST_EXPERTE.passwort);
  await intern.getByRole("button", { name: "Anmelden" }).click();
  await intern.getByRole("link", { name: "Beratungsanfragen" }).click();
  await expect(intern.getByText("Max Prüfling")).toBeVisible();
  await expect(intern.getByText("max@example.org")).toBeVisible();
});

test("Möglicherweise verspätete Abrechnung: erst Prüfbedarf mit Vorjahresabrechnung, kein vorschnelles Versprechen", async ({ page }) => {
  await hochladen(page);
  await zugangsdatum(page, "2026-01-15");
  await expect(page.getByRole("heading", { name: "Abrechnung möglicherweise zu spät" })).toBeVisible();
  await expect(page.getByText(/Dann müssten Sie 1\.214,88\s€ nicht zahlen\. Das bestätigen wir mit Ihrer Vorjahresabrechnung\./)).toBeVisible();
  await expect(page.getByText(/Bitte bereitlegen:.*Abrechnung des Vorjahres\..*Damit bestätigen wir den Abrechnungszeitraum/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /müssen Sie nicht bezahlen/ })).toHaveCount(0);
});

test("Prüfbedarf: Unterlage nachreichen – ohne KI-Zugang geht sie an einen Fachprüfer", async ({ page }) => {
  await hochladen(page);
  await expect(page.getByRole("heading", { name: "Prüfbedarf: Wir brauchen noch eine Unterlage" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByLabel("Unterlage hochladen").setInputFiles({ name: "vorjahr.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("status").filter({ hasText: "Ein Fachprüfer wertet sie aus" })).toBeVisible({ timeout: 15_000 });
  // Ergebnis bleibt unverändert, bis die Unterlage ausgewertet ist
  await expect(page.getByRole("heading", { name: "Prüfbedarf: Wir brauchen noch eine Unterlage" })).toBeVisible();
});
