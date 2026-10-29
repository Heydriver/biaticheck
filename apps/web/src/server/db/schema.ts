import type { Auslesung } from "@biaticheck/auslesen";
import type { AbrechnungEingabe, Pruefbericht } from "@biaticheck/pruefkern";
import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const FALLSTATUS = [
  "hochgeladen",
  "wird_ausgelesen",
  /** Ergebnis für den Kunden sichtbar. */
  "fertig",
  /** Wartet auf Experten (Freigabe, Unstimmigkeit oder manuelles Erfassen). */
  "expertenpruefung",
  /** Dokument ist keine Nebenkostenabrechnung. */
  "kein_nebenkostendokument",
  /** Technischer Fehler beim Auslesen. */
  "fehler",
] as const;
export type Fallstatus = (typeof FALLSTATUS)[number];

export type AuslesungMeta = Omit<Auslesung, "abrechnung">;

export const faelle = pgTable(
  "faelle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 des Zugangstokens – das Token selbst wird nie gespeichert. */
    zugangHash: text("zugang_hash").notNull(),
    status: text("status", { enum: FALLSTATUS }).notNull().default("hochgeladen"),
    daten: jsonb("daten").$type<AbrechnungEingabe>(),
    /** Unveränderte KI-Auslesung – Grundlage, um die Genauigkeit je Feld und Regel zu messen. */
    datenAutomatisch: jsonb("daten_automatisch").$type<AbrechnungEingabe>(),
    bericht: jsonb("bericht").$type<Pruefbericht>(),
    auslesung: jsonb("auslesung").$type<AuslesungMeta>(),
    fehler: text("fehler"),
    freigegebenAm: timestamp("freigegeben_am", { withTimezone: true }),
    /** Löschfrist (Datensparsamkeit). */
    loeschenAm: timestamp("loeschen_am", { withTimezone: true }).notNull(),
    erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
    aktualisiertAm: timestamp("aktualisiert_am", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("faelle_status_idx").on(t.status), index("faelle_loeschen_idx").on(t.loeschenAm)],
);

export const dokumente = pgTable("dokumente", {
  id: uuid("id").primaryKey().defaultRandom(),
  fallId: uuid("fall_id")
    .notNull()
    .references(() => faelle.id, { onDelete: "cascade" }),
  art: text("art", { enum: ["abrechnung", "heizkosten", "vorjahr", "mietvertrag"] }).notNull(),
  mimeType: text("mime_type").notNull(),
  groesse: integer("groesse").notNull(),
  sha256: text("sha256").notNull(),
  speicherschluessel: text("speicherschluessel").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
});

export const antworten = pgTable("antworten", {
  id: uuid("id").primaryKey().defaultRandom(),
  fallId: uuid("fall_id")
    .notNull()
    .references(() => faelle.id, { onDelete: "cascade" }),
  feld: text("feld").notNull(),
  wert: jsonb("wert").notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
});

/** Nachvollziehbarkeit: wer hat wann was mit einem Fall gemacht. Keine Inhalte der Abrechnung. */
export const protokoll = pgTable("protokoll", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fallId: uuid("fall_id")
    .notNull()
    .references(() => faelle.id, { onDelete: "cascade" }),
  akteur: text("akteur").notNull(),
  aktion: text("aktion").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>(),
  zeitpunkt: timestamp("zeitpunkt", { withTimezone: true }).notNull().defaultNow(),
});

/** Mitarbeitende mit Zugang zum internen Prüfbereich. */
export const experten = pgTable("experten", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwortHash: text("passwort_hash").notNull(),
  aktiv: boolean("aktiv").notNull().default(true),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
});

export const sitzungen = pgTable("sitzungen", {
  id: uuid("id").primaryKey().defaultRandom(),
  expertId: uuid("expert_id")
    .notNull()
    .references(() => experten.id, { onDelete: "cascade" }),
  /** SHA-256 des Sitzungstokens aus dem Cookie. */
  tokenHash: text("token_hash").notNull().unique(),
  laeuftAbAm: timestamp("laeuft_ab_am", { withTimezone: true }).notNull(),
  erstelltAm: timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow(),
});
