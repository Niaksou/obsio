CREATE TABLE "issued_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"site_id" uuid NOT NULL,
	"document_type" text,
	"scope" text NOT NULL,
	"reserve_count" integer NOT NULL,
	"lifted_count" integer NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"signer_fingerprint" text NOT NULL,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_document_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "issued_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issued_document" ADD CONSTRAINT "issued_document_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_document" ADD CONSTRAINT "issued_document_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issued_document" ADD CONSTRAINT "issued_document_site_id_organisation_id_site_id_organisation_id_fk" FOREIGN KEY ("site_id","organisation_id") REFERENCES "public"."site"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issued_document_organisation_id_index" ON "issued_document" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "issued_document_site_id_index" ON "issued_document" USING btree ("site_id");--> statement-breakpoint
CREATE POLICY "issued_document_organisation_isolation" ON "issued_document" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "issued_document_sha256_lookup" ON "issued_document" AS PERMISSIVE FOR SELECT TO public USING (sha256 = nullif(current_setting('app.document_sha256', true), ''));--> statement-breakpoint
-- Ajouté à la main : la RLS s'applique aussi au propriétaire, et un document émis n'est ni
-- modifié ni supprimé par l'application (seul pnpm org:delete, par app_owner, le supprime).
ALTER TABLE "issued_document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE UPDATE, DELETE ON "issued_document" FROM app_user;
