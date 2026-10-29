import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Ablage der hochgeladenen Dokumente.
 * Lokal im Dateisystem; Austausch gegen S3-kompatiblen Speicher über dasselbe Interface.
 * Mit Schlüssel werden Dateien mit AES-256-GCM verschlüsselt (Format: IV | Tag | Daten).
 */
export interface Dateispeicher {
  speichere(schluessel: string, daten: Uint8Array): Promise<void>;
  lade(schluessel: string): Promise<Uint8Array>;
  loesche(praefix: string): Promise<void>;
}

const ERLAUBTER_SCHLUESSEL = /^[0-9a-f-]{36}(\/[0-9a-f-]{36})?$/;
const MAGIC = Buffer.from("BCK1");

export function lokalerSpeicher(verzeichnis: string, schluesselBase64?: string): Dateispeicher {
  const basis = path.resolve(verzeichnis);
  const key = schluesselBase64 ? Buffer.from(schluesselBase64, "base64") : undefined;

  const pfad = (schluessel: string) => {
    // Nur von uns erzeugte UUID-Pfade – kein Ausbruch aus dem Verzeichnis möglich.
    if (!ERLAUBTER_SCHLUESSEL.test(schluessel)) throw new Error(`Ungültiger Speicherschlüssel`);
    return path.join(basis, schluessel);
  };

  return {
    async speichere(schluessel, daten) {
      const ziel = pfad(schluessel);
      await mkdir(path.dirname(ziel), { recursive: true });
      if (!key) return writeFile(ziel, daten);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const verschluesselt = Buffer.concat([cipher.update(daten), cipher.final()]);
      await writeFile(ziel, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), verschluesselt]));
    },
    async lade(schluessel) {
      const roh = await readFile(pfad(schluessel));
      const istVerschluesselt = roh.subarray(0, 4).equals(MAGIC);
      if (!istVerschluesselt) {
        if (key) throw new Error("Unverschlüsselte Datei, obwohl Verschlüsselung aktiv ist");
        return new Uint8Array(roh);
      }
      if (!key) throw new Error("Datei ist verschlüsselt, aber kein Schlüssel konfiguriert");
      const decipher = createDecipheriv("aes-256-gcm", key, roh.subarray(4, 16));
      decipher.setAuthTag(roh.subarray(16, 32));
      return new Uint8Array(Buffer.concat([decipher.update(roh.subarray(32)), decipher.final()]));
    },
    async loesche(praefix) {
      await rm(pfad(praefix), { recursive: true, force: true });
    },
  };
}
