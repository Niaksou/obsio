CREATE TYPE "public"."inspection_kind" AS ENUM('periodique', 'q18', 'q19');--> statement-breakpoint
CREATE TABLE "inspection_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" "inspection_kind" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"periodicity_months" integer NOT NULL,
	"planned_date" date,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_plan_site_id_kind_unique" UNIQUE("site_id","kind"),
	CONSTRAINT "inspection_plan_periodicity" CHECK ("inspection_plan"."periodicity_months" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "inspection_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inspection_plan" ADD CONSTRAINT "inspection_plan_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_plan" ADD CONSTRAINT "inspection_plan_site_id_organisation_id_site_id_organisation_id_fk" FOREIGN KEY ("site_id","organisation_id") REFERENCES "public"."site"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_plan_organisation_id_index" ON "inspection_plan" USING btree ("organisation_id");--> statement-breakpoint
CREATE POLICY "inspection_plan_organisation_isolation" ON "inspection_plan" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- Ajouté à la main : la RLS s'applique aussi au propriétaire des tables.
ALTER TABLE "inspection_plan" FORCE ROW LEVEL SECURITY;
