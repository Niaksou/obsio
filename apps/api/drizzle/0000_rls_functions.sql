-- Organisation courante, posée en début de transaction par l'API (set_config local).
-- nullif : une fois le paramètre utilisé dans la session, il vaut '' hors transaction.
CREATE FUNCTION app_current_organisation_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.organisation_id', true), '')::uuid $$;
