-- Durée maximale absolue d'une session (ASVS 7.3.2) : 12 heures après la connexion, quelle que
-- soit l'activité. Better Auth prolonge la session de 2 heures à chaque usage (inactivité,
-- ASVS 7.3.1) ; ce déclencheur plafonne l'échéance, y compris à la création.
CREATE FUNCTION "session_cap_expires_at"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."expires_at" := LEAST(NEW."expires_at", NEW."created_at" + interval '12 hours');
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "session_cap_expires_at"
BEFORE INSERT OR UPDATE OF "expires_at", "created_at" ON "session"
FOR EACH ROW EXECUTE FUNCTION "session_cap_expires_at"();--> statement-breakpoint
-- Sessions déjà ouvertes : même plafond.
UPDATE "session" SET "expires_at" = LEAST("expires_at", "created_at" + interval '12 hours');
