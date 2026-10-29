import { expect, test } from "@playwright/test";

const PDF = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");

test("Startseite passt ohne horizontales Scrollen auf den Bildschirm", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nebenkostenabrechnung");
  const breite = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(breite[0]).toBeLessThanOrEqual(breite[1]!);
});

test("Hochladen ist erst mit Datei und Einwilligung möglich, danach Weiterleitung zur Prüfung", async ({ page }) => {
  await page.goto("/");
  const knopf = page.getByRole("button", { name: "Kostenlos prüfen" });
  await expect(knopf).toBeDisabled();

  await page.locator("#datei").setInputFiles({ name: "abrechnung.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(knopf).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(knopf).toBeEnabled();
  await knopf.click();

  await expect(page).toHaveURL(/\/fall\/[0-9a-f-]{36}#[\w-]{40,}$/);
  // Ohne API-Schlüssel und mit Freigabepflicht geht der Fall an die Experten
  await expect(page.getByRole("heading", { name: "Ihre Abrechnung ist bei unseren Experten" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Bitte speichern Sie diesen Link")).toBeVisible();
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
