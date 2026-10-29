CREATE TABLE "experten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"passwort_hash" text NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experten_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sitzungen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"laeuft_ab_am" timestamp with time zone NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sitzungen_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "faelle" ADD COLUMN "daten_automatisch" jsonb;--> statement-breakpoint
ALTER TABLE "sitzungen" ADD CONSTRAINT "sitzungen_expert_id_experten_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."experten"("id") ON DELETE cascade ON UPDATE no action;