CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" jsonb,
	"siret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_organisation_id_index" ON "site" USING btree ("organisation_id");--> statement-breakpoint
CREATE POLICY "site_organisation_isolation" ON "site" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- La RLS s'applique aussi au propriétaire de la table.
ALTER TABLE "site" FORCE ROW LEVEL SECURITY;
