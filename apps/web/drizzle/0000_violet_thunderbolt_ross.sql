CREATE TABLE "antworten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid NOT NULL,
	"feld" text NOT NULL,
	"wert" jsonb NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dokumente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid NOT NULL,
	"art" text NOT NULL,
	"mime_type" text NOT NULL,
	"groesse" integer NOT NULL,
	"sha256" text NOT NULL,
	"speicherschluessel" text NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faelle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zugang_hash" text NOT NULL,
	"status" text DEFAULT 'hochgeladen' NOT NULL,
	"daten" jsonb,
	"bericht" jsonb,
	"auslesung" jsonb,
	"fehler" text,
	"freigegeben_am" timestamp with time zone,
	"loeschen_am" timestamp with time zone NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"aktualisiert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protokoll" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fall_id" uuid NOT NULL,
	"akteur" text NOT NULL,
	"aktion" text NOT NULL,
	"details" jsonb,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "antworten" ADD CONSTRAINT "antworten_fall_id_faelle_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."faelle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_fall_id_faelle_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."faelle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protokoll" ADD CONSTRAINT "protokoll_fall_id_faelle_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."faelle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faelle_status_idx" ON "faelle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faelle_loeschen_idx" ON "faelle" USING btree ("loeschen_am");