CREATE TABLE "reserve_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reserve_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "reserve_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reserve_member" ADD CONSTRAINT "reserve_member_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_member" ADD CONSTRAINT "reserve_member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_member" ADD CONSTRAINT "reserve_member_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_member" ADD CONSTRAINT "reserve_member_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_member" ADD CONSTRAINT "reserve_member_reserve_id_organisation_id_reserve_id_organisation_id_fk" FOREIGN KEY ("reserve_id","organisation_id") REFERENCES "public"."reserve"("id","organisation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserve_member_organisation_id_index" ON "reserve_member" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "reserve_member_reserve_id_index" ON "reserve_member" USING btree ("reserve_id");--> statement-breakpoint
CREATE INDEX "reserve_member_user_id_index" ON "reserve_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reserve_member_reserve_id_user_id_index" ON "reserve_member" USING btree ("reserve_id","user_id") WHERE "reserve_member"."removed_at" is null;--> statement-breakpoint
CREATE POLICY "reserve_member_organisation_isolation" ON "reserve_member" AS PERMISSIVE FOR ALL TO public USING (organisation_id = app_current_organisation_id()) WITH CHECK (organisation_id = app_current_organisation_id());--> statement-breakpoint
ALTER TABLE "reserve_member" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Une assignation à un collaborateur se retire (removed_at), elle ne se supprime pas.
REVOKE DELETE ON "reserve_member" FROM app_user;
