CREATE TABLE "console_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_organisation_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_member" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "console_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "console_audit" ADD CONSTRAINT "console_audit_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_audit_created_at_index" ON "console_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "console_audit_target_organisation_id_index" ON "console_audit" USING btree ("target_organisation_id");--> statement-breakpoint
-- Journal de la console en ajout seul ; statut d'équipe Obsio attribué seulement par la commande
-- staff:grant (rôle propriétaire) : une faille de l'application ne peut pas en créer.
REVOKE UPDATE, DELETE ON "console_audit" FROM app_user;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "staff_member" FROM app_user;
