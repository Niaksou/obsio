-- Contrainte requise par la clé étrangère (site_id, organisation_id) de building : à créer avant elle.
ALTER TABLE "site" ADD CONSTRAINT "site_id_organisation_id_unique" UNIQUE("id","organisation_id");--> statement-breakpoint
CREATE TYPE "public"."equipment_type" AS ENUM('tgbt', 'td', 'coffret', 'armoire', 'eclairage_securite', 'prise_courant', 'luminaire', 'transformateur', 'onduleur', 'borne_recharge', 'machine', 'autre');--> statement-breakpoint
CREATE TABLE "building" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "building_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "building" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"type" "equipment_type" NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"x" real,
	"y" real,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_position" CHECK (("equipment"."x" is null and "equipment"."y" is null) or ("equipment"."x" is not null and "equipment"."y" is not null and "equipment"."x" between 0 and 1 and "equipment"."y" between 0 and 1))
);
--> statement-breakpoint
ALTER TABLE "equipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "floor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"plan_source_key" text,
	"plan_image_key" text,
	"plan_width" integer,
	"plan_height" integer,
	"scale" real,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "floor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "building" ADD CONSTRAINT "building_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building" ADD CONSTRAINT "building_site_id_organisation_id_site_id_organisation_id_fk" FOREIGN KEY ("site_id","organisation_id") REFERENCES "public"."site"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_floor_id_organisation_id_floor_id_organisation_id_fk" FOREIGN KEY ("floor_id","organisation_id") REFERENCES "public"."floor"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor" ADD CONSTRAINT "floor_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor" ADD CONSTRAINT "floor_building_id_organisation_id_building_id_organisation_id_fk" FOREIGN KEY ("building_id","organisation_id") REFERENCES "public"."building"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "building_organisation_id_index" ON "building" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "building_site_id_index" ON "building" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "equipment_organisation_id_index" ON "equipment" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "equipment_floor_id_index" ON "equipment" USING btree ("floor_id");--> statement-breakpoint
CREATE INDEX "floor_organisation_id_index" ON "floor" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "floor_building_id_index" ON "floor" USING btree ("building_id");--> statement-breakpoint
CREATE POLICY "building_organisation_isolation" ON "building" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "equipment_organisation_isolation" ON "equipment" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "floor_organisation_isolation" ON "floor" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- La RLS s'applique aussi au propriétaire de la table.
ALTER TABLE "building" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "floor" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "equipment" FORCE ROW LEVEL SECURITY;
