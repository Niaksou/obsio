CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"due_date" date,
	"message" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "assignment_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assignment_reserve" (
	"organisation_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"reserve_id" uuid NOT NULL,
	CONSTRAINT "assignment_reserve_assignment_id_reserve_id_pk" PRIMARY KEY("assignment_id","reserve_id")
);
--> statement-breakpoint
ALTER TABLE "assignment_reserve" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contractor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_id_organisation_id_unique" UNIQUE("id","organisation_id")
);
--> statement-breakpoint
ALTER TABLE "contractor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proof" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reserve_id" uuid NOT NULL,
	"assignment_id" uuid,
	"author_user_id" uuid,
	"author_contractor_id" uuid,
	"comment" text,
	"photo_keys" text[] DEFAULT '{}' NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "proof" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_contractor_id_organisation_id_contractor_id_organisation_id_fk" FOREIGN KEY ("contractor_id","organisation_id") REFERENCES "public"."contractor"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_reserve" ADD CONSTRAINT "assignment_reserve_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_reserve" ADD CONSTRAINT "assignment_reserve_assignment_id_organisation_id_assignment_id_organisation_id_fk" FOREIGN KEY ("assignment_id","organisation_id") REFERENCES "public"."assignment"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_reserve" ADD CONSTRAINT "assignment_reserve_reserve_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reserve_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof" ADD CONSTRAINT "proof_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof" ADD CONSTRAINT "proof_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof" ADD CONSTRAINT "proof_reserve_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reserve_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof" ADD CONSTRAINT "proof_assignment_id_organisation_id_assignment_id_organisation_id_fk" FOREIGN KEY ("assignment_id","organisation_id") REFERENCES "public"."assignment"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof" ADD CONSTRAINT "proof_author_contractor_id_organisation_id_contractor_id_organisation_id_fk" FOREIGN KEY ("author_contractor_id","organisation_id") REFERENCES "public"."contractor"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_organisation_id_index" ON "assignment" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "assignment_reserve_organisation_id_index" ON "assignment_reserve" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "assignment_reserve_reserve_id_index" ON "assignment_reserve" USING btree ("reserve_id");--> statement-breakpoint
CREATE INDEX "contractor_organisation_id_index" ON "contractor" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "proof_organisation_id_index" ON "proof" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "proof_reserve_id_index" ON "proof" USING btree ("reserve_id");--> statement-breakpoint
CREATE POLICY "assignment_organisation_isolation" ON "assignment" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "assignment_token_lookup" ON "assignment" AS PERMISSIVE FOR SELECT TO public USING (token_hash = nullif(current_setting('app.assignment_token_hash', true), ''));--> statement-breakpoint
CREATE POLICY "assignment_reserve_organisation_isolation" ON "assignment_reserve" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "contractor_organisation_isolation" ON "contractor" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
CREATE POLICY "proof_organisation_isolation" ON "proof" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
-- Ajouté à la main : la RLS s'applique aussi au propriétaire des tables.
ALTER TABLE "contractor" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assignment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assignment_reserve" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proof" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Ajouté à la main : une preuve n'est ni modifiée ni supprimée.
REVOKE UPDATE, DELETE ON "proof" FROM app_user;
