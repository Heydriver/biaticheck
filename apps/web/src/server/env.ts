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
  })
  .refine((e) => e.NODE_ENV !== "production" || e.DATEI_SCHLUESSEL, {
    message: "DATEI_SCHLUESSEL ist im Produktivbetrieb Pflicht (Verschlüsselung der Abrechnungen)",
    path: ["DATEI_SCHLUESSEL"],
  });

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
