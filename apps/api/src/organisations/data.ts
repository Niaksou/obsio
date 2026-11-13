import { eq, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  assignment,
  assignmentReserve,
  reserveMember,
  building,
  contractor,
  draftReserve,
  equipment,
  floor,
  inspectionPlan,
  licence,
  organisation,
  pageView,
  proof,
  reportDocument,
  reportImport,
  reserve,
  reserveEvent,
  reserveSource,
  site,
  zone,
} from '../db/schema/index.js';

/**
 * Tables métier d'une organisation, des parents vers les enfants : l'export les suit dans cet
 * ordre, la suppression dans l'ordre inverse. Un test échoue si une table portant
 * organisation_id manque ici (hors member et invitation, traitées à part).
 */
export const ORGANISATION_TABLES = [
  { table: licence },
  { table: site },
  { table: building },
  { table: floor },
  { table: equipment },
  { table: zone },
  { table: inspectionPlan },
  { table: contractor },
  // L'empreinte du jeton d'un lien intervenant ne sert à rien hors de l'application.
  { table: assignment, omit: ['token_hash'] },
  { table: reportImport },
  { table: reportDocument },
  { table: reserve },
  { table: draftReserve },
  { table: reserveSource },
  { table: assignmentReserve },
  { table: reserveMember },
  { table: proof },
  { table: reserveEvent },
  { table: pageView },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value);

/** Organisation désignée par son identifiant ou son slug, ou null si elle n'existe pas. */
export async function findOrganisation(db: Database, idOrSlug: string) {
  const found = await db.query.organisation.findFirst({
    where: isUuid(idOrSlug)
      ? or(eq(organisation.id, idOrSlug), eq(organisation.slug, idOrSlug))
      : eq(organisation.slug, idOrSlug),
  });
  return found ?? null;
}
