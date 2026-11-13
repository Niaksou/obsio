CREATE TYPE "public"."licence_plan" AS ENUM('essai', 'standard', 'sur_mesure');--> statement-breakpoint
CREATE TYPE "public"."licence_status" AS ENUM('active', 'suspendue', 'revoquee');--> statement-breakpoint
CREATE TABLE "licence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"plan" "licence_plan" NOT NULL,
	"status" "licence_status" DEFAULT 'active' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"max_sites" integer,
	"max_members" integer,
	"max_analyses_per_month" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licence_organisation_id_unique" UNIQUE("organisation_id"),
	CONSTRAINT "licence_dates" CHECK ("licence"."ends_on" is null or "licence"."ends_on" >= "licence"."starts_on"),
	CONSTRAINT "licence_caps" CHECK (coalesce("licence"."max_sites", 0) >= 0 and coalesce("licence"."max_members", 0) >= 0 and coalesce("licence"."max_analyses_per_month", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "licence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "licence" ADD CONSTRAINT "licence_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "licence_organisation_isolation" ON "licence" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
ALTER TABLE "licence" FORCE ROW LEVEL SECURITY;