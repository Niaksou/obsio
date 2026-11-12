-- Zones en contour libre (pièce en L…) : chaque rectangle existant devient un contour à 4 angles.
ALTER TABLE "zone" DROP CONSTRAINT "zone_bounds";--> statement-breakpoint
ALTER TABLE "zone" ADD COLUMN "points" jsonb;--> statement-breakpoint
-- La RLS forcée masque toutes les lignes au propriétaire pendant la migration : levée le temps de
-- convertir, rétablie juste après, dans la même transaction.
ALTER TABLE "zone" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "zone" SET "points" = jsonb_build_array(
	jsonb_build_object('x', "x", 'y', "y"),
	jsonb_build_object('x', "x" + "width", 'y', "y"),
	jsonb_build_object('x', "x" + "width", 'y', "y" + "height"),
	jsonb_build_object('x', "x", 'y', "y" + "height")
);--> statement-breakpoint
ALTER TABLE "zone" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "zone" ALTER COLUMN "points" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "zone" DROP COLUMN "x";--> statement-breakpoint
ALTER TABLE "zone" DROP COLUMN "y";--> statement-breakpoint
ALTER TABLE "zone" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "zone" DROP COLUMN "height";--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_points" CHECK (jsonb_typeof("zone"."points") = 'array' and jsonb_array_length("zone"."points") between 3 and 100);
