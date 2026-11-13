ALTER TABLE "member" ADD COLUMN "founder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "member_one_founder" ON "member" USING btree ("organisation_id") WHERE "member"."founder";--> statement-breakpoint
-- Trois rôles : les membres deviennent responsables (ils gardent tout ce qu'ils voyaient).
UPDATE "member" SET "role" = 'responsable' WHERE "role" = 'membre';--> statement-breakpoint
UPDATE "invitation" SET "role" = 'responsable' WHERE "role" = 'membre';--> statement-breakpoint
-- Admin fondateur : le premier admin arrivé dans chaque organisation.
UPDATE "member" SET "founder" = true WHERE "id" IN (
  SELECT DISTINCT ON ("organisation_id") "id" FROM "member"
  WHERE "role" = 'admin' ORDER BY "organisation_id", "created_at", "id"
);
