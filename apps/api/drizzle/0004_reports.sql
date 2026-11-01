ALTER TABLE "equipment" ADD CONSTRAINT "equipment_id_organisation_id_unique" UNIQUE("id","organisation_id");--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('periodique', 'initiale', 'q18', 'q19', 'autre');--> statement-breakpoint
CREATE TYPE "public"."draft_decision" AS ENUM('a_valider', 'retenue', 'ecartee');--> statement-breakpoint
CREATE TYPE "public"."draft_origin" AS ENUM('extraction', 'constatation_q18');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('en_analyse', 'a_valider', 'valide', 'erreur');--> statement-breakpoint
CREATE TYPE "public"."reserve_status" AS ENUM('ouverte', 'assignee', 'corrigee', 'levee');--> statement-breakpoint
CREATE TABLE "draft_reserve" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"origin" "draft_origin" DEFAULT 'extraction' NOT NULL,
	"extracted" jsonb NOT NULL,
	"confiance" real,
	"description" text NOT NULL,
	"preconisation" text,
	"gravite" text,
	"equipment_id" uuid,
	"proposed_equipment_id" uuid,
	"reconduite_de_id" uuid,
	"proposed_reconduite_de_id" uuid,
	"merge_into_id" uuid,
	"proposed_merge_into_id" uuid,
	"decision" "draft_decision" DEFAULT 'a_valider' NOT NULL,
	"reserve_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_reserve_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "draft_reserve" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "document_type" NOT NULL,
	"organisme" text NOT NULL,
	"numero_rapport" text,
	"date_visite" date,
	"q18" jsonb,
	"q19" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_document_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "report_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"pdf_key" text NOT NULL,
	"status" "import_status" DEFAULT 'en_analyse' NOT NULL,
	"error" text,
	"trace" jsonb,
	"created_by" uuid NOT NULL,
	"validated_at" timestamp with time zone,
	"validated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_import_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "report_import" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reserve" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"equipment_id" uuid,
	"description" text NOT NULL,
	"preconisation" text,
	"gravite" text,
	"status" "reserve_status" DEFAULT 'ouverte' NOT NULL,
	"due_date" date,
	"reconduite_de_id" uuid,
	"import_id" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reserve_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "reserve" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reserve_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reserve_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_contractor_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reserve_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reserve_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reserve_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"origin" "draft_origin" DEFAULT 'extraction' NOT NULL,
	"reference" text NOT NULL,
	"code_observation" text,
	"description" text NOT NULL,
	"preconisation" text,
	"article_reglementaire" text,
	"localisation_texte" text,
	"gravite" text,
	"page_source" integer NOT NULL,
	"constatation_q18" integer,
	"thermique" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reserve_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_import_id_organisation_id_report_import_id_organisation_id_fk" FOREIGN KEY ("import_id","organisation_id") REFERENCES "public"."report_import"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_document_id_organisation_id_report_document_id_organisation_id_fk" FOREIGN KEY ("document_id","organisation_id") REFERENCES "public"."report_document"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_equipment_id_organisation_id_equipment_id_organisation_id_fk" FOREIGN KEY ("equipment_id","organisation_id") REFERENCES "public"."equipment"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_reconduite_de_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reconduite_de_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_merge_into_id_organisation_id_draft_reserve_id_organisation_id_fk" FOREIGN KEY ("merge_into_id","organisation_id") REFERENCES "public"."draft_reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_reserve" ADD CONSTRAINT "draft_reserve_reserve_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reserve_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_document" ADD CONSTRAINT "report_document_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_document" ADD CONSTRAINT "report_document_import_id_organisation_id_report_import_id_organisation_id_fk" FOREIGN KEY ("import_id","organisation_id") REFERENCES "public"."report_import"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_document" ADD CONSTRAINT "report_document_site_id_organisation_id_site_id_organisation_id_fk" FOREIGN KEY ("site_id","organisation_id") REFERENCES "public"."site"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_import" ADD CONSTRAINT "report_import_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_import" ADD CONSTRAINT "report_import_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_import" ADD CONSTRAINT "report_import_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_import" ADD CONSTRAINT "report_import_site_id_organisation_id_site_id_organisation_id_fk" FOREIGN KEY ("site_id","organisation_id") REFERENCES "public"."site"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_site_id_organisation_id_site_id_organisation_id_fk" FOREIGN KEY ("site_id","organisation_id") REFERENCES "public"."site"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_equipment_id_organisation_id_equipment_id_organisation_id_fk" FOREIGN KEY ("equipment_id","organisation_id") REFERENCES "public"."equipment"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_reconduite_de_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reconduite_de_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_import_id_organisation_id_report_import_id_organisation_id_fk" FOREIGN KEY ("import_id","organisation_id") REFERENCES "public"."report_import"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_event" ADD CONSTRAINT "reserve_event_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_event" ADD CONSTRAINT "reserve_event_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_event" ADD CONSTRAINT "reserve_event_reserve_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reserve_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_source" ADD CONSTRAINT "reserve_source_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_source" ADD CONSTRAINT "reserve_source_reserve_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reserve_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_source" ADD CONSTRAINT "reserve_source_document_id_organisation_id_report_document_id_organisation_id_fk" FOREIGN KEY ("document_id","organisation_id") REFERENCES "public"."report_document"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_reserve_organisation_id_index" ON "draft_reserve" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "draft_reserve_import_id_index" ON "draft_reserve" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "report_document_organisation_id_index" ON "report_document" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "report_document_import_id_index" ON "report_document" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "report_document_site_id_index" ON "report_document" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "report_import_organisation_id_index" ON "report_import" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "report_import_site_id_index" ON "report_import" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "reserve_organisation_id_index" ON "reserve" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "reserve_site_id_index" ON "reserve" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "reserve_equipment_id_index" ON "reserve" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "reserve_event_organisation_id_index" ON "reserve_event" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "reserve_event_reserve_id_index" ON "reserve_event" USING btree ("reserve_id");--> statement-breakpoint
CREATE INDEX "reserve_source_organisation_id_index" ON "reserve_source" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "reserve_source_reserve_id_index" ON "reserve_source" USING btree ("reserve_id");--> statement-breakpoint
CREATE POLICY "draft_reserve_organisation_isolation" ON "draft_reserve" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "report_document_organisation_isolation" ON "report_document" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "report_import_organisation_isolation" ON "report_import" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "reserve_organisation_isolation" ON "reserve" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "reserve_event_organisation_isolation" ON "reserve_event" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "reserve_source_organisation_isolation" ON "reserve_source" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- Ajouté à la main : la RLS s'applique aussi au propriétaire des tables.
ALTER TABLE "report_import" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "draft_reserve" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reserve" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reserve_source" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reserve_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Ajouté à la main : pas de suppression physique des réserves, et un journal d'audit non modifiable.
REVOKE DELETE ON "reserve", "reserve_source" FROM app_user;--> statement-breakpoint
REVOKE UPDATE, DELETE ON "reserve_event" FROM app_user;
