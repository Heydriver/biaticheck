/** Läuft einmal beim Serverstart: Fehlkonfiguration bricht sofort ab statt beim ersten Kunden. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("./server/env");
    env();
  }
}
