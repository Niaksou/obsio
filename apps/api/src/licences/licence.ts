import {
  defaultLicence,
  licenceAccess,
  parisDate,
  type Licence,
  type LicenceAccess,
} from '@obsio/shared';
import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import { invitation, licence, member, reportImport, site } from '../db/schema/index.js';

// Licence d'un client : lue à chaque requête qui modifie ses données (lecture seule si elle est
// suspendue, révoquée ou échue) et à chaque ajout borné par un plafond.

/** Refus lié à la licence : réponse 403 avec ce message, par le gestionnaire d'erreurs. */
export class LicenceRefused extends Error {
  readonly statusCode = 403;
}

type LicenceRow = typeof licence.$inferSelect;

export function toLicence(row: LicenceRow): Licence {
  return {
    plan: row.plan,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    maxSites: row.maxSites,
    maxMembers: row.maxMembers,
    maxAnalysesPerMonth: row.maxAnalysesPerMonth,
    note: row.note,
  };
}

/** Licence de l'organisation posée sur la transaction, ou la licence par défaut. */
export async function readLicence(tx: Transaction): Promise<Licence> {
  const row = await tx.query.licence.findFirst();
  return row ? toLicence(row) : defaultLicence(parisDate());
}

export function findLicence(db: Database, organisationId: string): Promise<Licence> {
  return withOrganisation(db, organisationId, readLicence);
}

export async function findLicenceAccess(
  db: Database,
  organisationId: string,
): Promise<LicenceAccess> {
  return licenceAccess(await findLicence(db, organisationId));
}

/** Enregistre la licence d'une organisation (création ou remplacement). */
export async function saveLicence(tx: Transaction, organisationId: string, value: Licence) {
  await tx
    .insert(licence)
    .values({ organisationId, ...value })
    .onConflictDoUpdate({ target: licence.organisationId, set: value });
}

/** Refuse si la licence ne permet plus d'ajouter de données. */
export function assertLicenceWritable(value: Licence) {
  const access = licenceAccess(value);
  if (access.access === 'lecture') {
    throw new LicenceRefused(
      'Licence inactive : vos données restent consultables et exportables, rien ne peut être ajouté.',
    );
  }
}

/** Sites actifs : refuse la création au-delà du plafond de la licence. */
export async function assertSiteAvailable(tx: Transaction) {
  const value = await readLicence(tx);
  assertLicenceWritable(value);
  if (value.maxSites === null) return;
  const [row] = await tx.select({ total: count() }).from(site).where(isNull(site.archivedAt));
  if (row!.total >= value.maxSites) {
    throw new LicenceRefused(
      `Votre licence comprend ${value.maxSites} site${value.maxSites > 1 ? 's' : ''} : archivez-en un ou contactez Obsio.`,
    );
  }
}

/** Analyses de rapport du mois en cours (heure de Paris), échecs compris : Mistral a été appelé. */
export async function analysesThisMonth(tx: Transaction): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(reportImport)
    .where(
      sql`${reportImport.createdAt} >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`,
    );
  return row!.total;
}

/** Refuse une analyse de plus au-delà du plafond mensuel de la licence. */
export async function assertAnalysisAvailable(tx: Transaction) {
  const value = await readLicence(tx);
  assertLicenceWritable(value);
  if (value.maxAnalysesPerMonth === null) return;
  if ((await analysesThisMonth(tx)) >= value.maxAnalysesPerMonth) {
    throw new LicenceRefused(
      `Votre licence comprend ${value.maxAnalysesPerMonth} analyses de rapport par mois : la limite est atteinte pour ce mois-ci.`,
    );
  }
}

/**
 * Membres et invitations en attente : une invitation de plus doit tenir dans le plafond. Une
 * invitation en attente à la même adresse ne compte pas : la nouvelle la remplace.
 */
export async function assertInvitationAllowed(db: Database, organisationId: string, email: string) {
  const value = await findLicence(db, organisationId);
  assertLicenceWritable(value);
  if (value.maxMembers === null) return;
  const [members] = await db
    .select({ total: count() })
    .from(member)
    .where(eq(member.organisationId, organisationId));
  const [pending] = await db
    .select({ total: count() })
    .from(invitation)
    .where(
      and(
        eq(invitation.organisationId, organisationId),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
        ne(invitation.email, email.toLowerCase()),
      ),
    );
  if (members!.total + pending!.total >= value.maxMembers) {
    throw new LicenceRefused(
      `Votre licence comprend ${value.maxMembers} utilisateurs, invitations en attente comprises : retirez-en un ou contactez Obsio.`,
    );
  }
}
