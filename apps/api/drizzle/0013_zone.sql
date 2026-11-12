CREATE TABLE "zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_id_organisation_id_unique" UNIQUE("id","organisation_id"),
	CONSTRAINT "zone_bounds" CHECK ("zone"."x" >= 0 and "zone"."y" >= 0 and "zone"."width" > 0 and "zone"."height" > 0 and "zone"."x" + "zone"."width" <= 1.0001 and "zone"."y" + "zone"."height" <= 1.0001)
);
--> statement-breakpoint
ALTER TABLE "zone" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_floor_id_organisation_id_floor_id_organisation_id_fk" FOREIGN KEY ("floor_id","organisation_id") REFERENCES "public"."floor"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zone_organisation_id_index" ON "zone" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "zone_floor_id_index" ON "zone" USING btree ("floor_id");--> statement-breakpoint
CREATE POLICY "zone_organisation_isolation" ON "zone" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
ALTER TABLE "zone" FORCE ROW LEVEL SECURITY;
