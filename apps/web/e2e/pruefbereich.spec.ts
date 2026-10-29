import { expect, test, type APIRequestContext } from "@playwright/test";
import { G001 } from "../../../packages/pruefkern/test/golden/G-001";
import { TEST_EXPERTE } from "./vorbereitung";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");

async function kundeLaedtHoch(request: APIRequestContext) {
  const antwort = await request.post("/api/faelle", {
    multipart: { datei: { name: "a.pdf", mimeType: "application/pdf", buffer: PDF }, einwilligung: "ja" },
  });
  expect(antwort.status()).toBe(201);
  return (await antwort.json()) as { id: string; token: string };
}

test("Ablauf: Upload → Expertin erfasst und gibt frei → Kunde sieht Erstauswertung", async ({ page, request, browser }) => {
  test.skip(test.info().project.name === "handy", "Prüfbereich ist für den Desktop gedacht");
  const { id, token } = await kundeLaedtHoch(request);

  // Ohne Anmeldung → Anmeldeseite
  await page.goto("/intern");
  await expect(page).toHaveURL(/\/intern\/anmelden$/);

  // Falsches Passwort
  await page.getByLabel("E-Mail").fill(TEST_EXPERTE.email);
  await page.getByLabel("Passwort").fill("falsches-passwort-xyz");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("E-Mail oder Passwort ist falsch.");

  // Richtiges Passwort → Arbeitsliste
  await page.getByLabel("Passwort").fill(TEST_EXPERTE.passwort);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: /Fälle/ })).toBeVisible();
  await expect(page.getByText(TEST_EXPERTE.name)).toBeVisible();

  // Fall öffnen
  await page.goto(`/intern/fall/${id}`);
  await expect(page.locator('iframe[title="Originaldokument"]')).toBeVisible();
  await expect(page.getByText("Automatisches Auslesen ist nicht konfiguriert")).toBeVisible();

  // Freigabe ohne Daten nicht möglich
  await expect(page.getByRole("button", { name: "Freigeben" })).toBeDisabled();

  // Daten über die JSON-Ansicht erfassen, speichern, prüfen
  await page.getByRole("button", { name: "JSON" }).click();
  await page.locator("textarea").fill(JSON.stringify(G001));
  await page.getByRole("button", { name: "Speichern & prüfen" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Gespeichert und neu geprüft." })).toBeVisible();

  await page.getByRole("button", { name: "Prüfergebnis" }).click();
  await expect(page.getByText("Vorauszahlungen Heizkosten prüfen")).toBeVisible();

  // Freigeben
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Freigeben" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Freigegeben" })).toBeVisible();

  // Kunde (eigener Browser ohne Experten-Cookie) sieht seine Erstauswertung
  const kunde = await (await browser.newContext()).newPage();
  await kunde.goto(`/fall/${id}#${token}`);
  await expect(kunde.getByRole("heading", { name: "Ihre kostenlose Erstauswertung" })).toBeVisible();
  await expect(kunde.getByText("1.236,44 €")).toBeVisible();
  // Interne Details (Erklärungen) sind für den Kunden nicht sichtbar
  await expect(kunde.getByText("Angerechnet sind 1.176,41 €")).toHaveCount(0);
});

test("Interne API: ohne Anmeldung 401, fremde Herkunft 403, Formularfehler verständlich", async ({ page, request }) => {
  test.skip(test.info().project.name === "handy");
  const { id } = await kundeLaedtHoch(request);

  const ohne = await request.put(`/api/intern/faelle/${id}/daten`, { data: G001, headers: { origin: "http://localhost:3100" } });
  expect(ohne.status()).toBe(401);

  // Anmelden im Browser, dann Anfrage von "fremder Seite" mit gültigem Cookie
  await page.goto("/intern/anmelden");
  await page.getByLabel("E-Mail").fill(TEST_EXPERTE.email);
  await page.getByLabel("Passwort").fill(TEST_EXPERTE.passwort);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/intern$/);

  const fremd = await page.request.put(`/api/intern/faelle/${id}/daten`, { data: G001, headers: { origin: "https://boese.example" } });
  expect(fremd.status()).toBe(403);

  const ungueltig = await page.request.put(`/api/intern/faelle/${id}/daten`, {
    data: { meta: {}, kostenpositionen: [{ id: "x", bezeichnung: "X", kategorie: "erfunden", anteilMieter: 1 }] },
    headers: { origin: "http://localhost:3100" },
  });
  expect(ungueltig.status()).toBe(400);
  expect((await ungueltig.json()).details[0].pfad).toBe("kostenpositionen.0.kategorie");

  // Originaldokument nur mit Anmeldung
  const doks = await page.request.get(`/intern/fall/${id}`);
  expect(doks.status()).toBe(200);
});
