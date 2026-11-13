CREATE TABLE "page_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_view_organisation_id_day_path_unique" UNIQUE("organisation_id","day","path")
);
--> statement-breakpoint
ALTER TABLE "page_view" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "page_view" ADD CONSTRAINT "page_view_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "page_view_organisation_isolation" ON "page_view" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
ALTER TABLE "page_view" FORCE ROW LEVEL SECURITY;