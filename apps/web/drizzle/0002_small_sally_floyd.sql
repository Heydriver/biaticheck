CREATE TABLE "beratungsanfragen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"telefon" text,
	"erreichbarkeit" text,
	"nachricht" text,
	"status" text DEFAULT 'neu' NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faelle" ADD COLUMN "bezahlt_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "faelle" ADD COLUMN "zahlungsart" text;--> statement-breakpoint
ALTER TABLE "beratungsanfragen" ADD CONSTRAINT "beratungsanfragen_fall_id_faelle_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."faelle"("id") ON DELETE cascade ON UPDATE no action;