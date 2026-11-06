import "server-only";
import { z } from "zod";

const janein = z.enum(["true", "false"]).transform((v) => v === "true");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
    UPLOAD_DIR: z.string().default("./.daten/uploads"),
    DATEI_SCHLUESSEL: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => v === undefined || Buffer.from(v, "base64").length === 32, "DATEI_SCHLUESSEL muss 32 Byte (Base64) lang sein"),
    FREIGABE_ERFORDERLICH: janein.default(true),
    UPLOADS_PRO_STUNDE: z.coerce.number().int().positive().default(10),
    /**
     * Freischaltung der ausführlichen Auswertung:
     * "test" = ohne Bezahlung (nur Entwicklung/Testumgebung), "aus" = nicht freischaltbar.
     * Standard: im Produktivbetrieb "aus", sonst "test". Echte Bezahlung (Stripe) folgt, sobald ein Konto vorhanden ist.
     */
    ZAHLUNG_MODUS: z.enum(["test", "aus"]).optional(),
    /** Muss im Produktivbetrieb ausdrücklich gesetzt sein, damit der Testmodus erlaubt ist (z. B. test.biati.de). */
    ERLAUBE_TESTZAHLUNG: janein.default(false),
    /** Ohne API-Schlüssel die Musterabrechnung als Demo-Ergebnis verwenden (nie im Produktivbetrieb). */
    DEMO_AUSLESEN: janein.default(false),
  })
  .refine((e) => e.NODE_ENV !== "production" || e.ZAHLUNG_MODUS !== "test" || e.ERLAUBE_TESTZAHLUNG, {
    message: "ZAHLUNG_MODUS=test ist im Produktivbetrieb nur mit ERLAUBE_TESTZAHLUNG=true erlaubt (Testumgebung)",
    path: ["ZAHLUNG_MODUS"],
  })
  .refine((e) => e.NODE_ENV !== "production" || !e.DEMO_AUSLESEN, {
    message: "DEMO_AUSLESEN ist im Produktivbetrieb nicht erlaubt",
    path: ["DEMO_AUSLESEN"],
  })
  .refine((e) => e.NODE_ENV !== "production" || e.DATEI_SCHLUESSEL, {
    message: "DATEI_SCHLUESSEL ist im Produktivbetrieb Pflicht (Verschlüsselung der Abrechnungen)",
    path: ["DATEI_SCHLUESSEL"],
  })
  .transform((e) => ({ ...e, ZAHLUNG_MODUS: e.ZAHLUNG_MODUS ?? (e.NODE_ENV === "production" ? "aus" : "test") }) as const);

export type Env = z.infer<typeof EnvSchema>;

let zwischenspeicher: Env | undefined;

/** Liest und prüft die Konfiguration einmalig. Fehlerhafte Konfiguration bricht sofort ab. */
export function env(): Env {
  if (zwischenspeicher) return zwischenspeicher;
  const ergebnis = EnvSchema.safeParse(process.env);
  if (!ergebnis.success) {
    const fehler = ergebnis.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ungültige Konfiguration:\n${fehler}`);
  }
  zwischenspeicher = ergebnis.data;
  return zwischenspeicher;
}
