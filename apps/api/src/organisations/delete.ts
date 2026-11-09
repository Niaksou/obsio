import { organisationPrefix } from '@obsio/shared';
import { count, eq, getTableName, inArray, ne } from 'drizzle-orm';
import { withOrganisation, type Database } from '../db/client.js';
import {
  invitation,
  member,
  organisation,
  reportImport,
  session,
  user,
} from '../db/schema/index.js';
import type { ExtractionQueue } from '../imports/queue.js';
import type { Storage } from '../storage.js';
import { ORGANISATION_TABLES } from './data.js';

// Suppression d'une organisation entière, à la demande du client : seule exception à la règle
// « pas de suppression physique » (spec, « RGPD »). Elle passe par le rôle propriétaire de la
// base, car l'application n'a pas le droit de supprimer réserves, preuves et journal d'audit.

export class DeletionError extends Error {}

export interface DeletionPlan {
  /** null : l'organisation n'est plus en base, il ne reste que des fichiers à supprimer. */
  organisation: { id: string; name: string } | null;
  /** Lignes à supprimer par table. */
  tables: Record<string, number>;
  /** Comptes sans autre organisation, supprimés avec elle (adresses e-mail). */
  usersToDelete: string[];
  /** Comptes membres d'une autre organisation : seule leur appartenance disparaît. */
  usersToKeep: string[];
  files: number;
  bytes: number;
}

export interface DeletionResult {
  tables: Record<string, number>;
  usersDeleted: string[];
  /** Comptes sans autre organisation mais encore cités par les données d'une autre. */
  usersKept: string[];
  files: number;
}

/** Erreur PostgreSQL 23503, éventuellement enveloppée par Drizzle. */
function isForeignKeyViolation(error: unknown): boolean {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return code === '23503' || cause?.code === '23503';
}

/** Comptes membres de l'organisation, partagés selon qu'ils appartiennent à une autre. */
async function memberAccounts(db: Database, organisationId: string) {
  const elsewhere = db
    .select({ userId: member.userId })
    .from(member)
    .where(ne(member.organisationId, organisationId));
  const rows = await db
    .select({ id: user.id, email: user.email, shared: inArray(user.id, elsewhere) })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organisationId, organisationId))
    .orderBy(user.email);
  return {
    toDelete: rows.filter((row) => !row.shared),
    toKeep: rows.filter((row) => row.shared),
  };
}

/** Ce que la suppression effacerait, sans rien modifier. db : connexion du rôle propriétaire. */
export async function planOrganisationDeletion(
  deps: { db: Database; storage: Storage },
  organisationId: string,
): Promise<DeletionPlan> {
  const { db, storage } = deps;
  const found = await db.query.organisation.findFirst({
    where: eq(organisation.id, organisationId),
  });
  const files = await storage.list(organisationPrefix(organisationId));
  const plan: DeletionPlan = {
    organisation: found ? { id: found.id, name: found.name } : null,
    tables: {},
    usersToDelete: [],
    usersToKeep: [],
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
  };
  if (!found) return plan;

  await withOrganisation(db, organisationId, async (tx) => {
    for (const { table } of ORGANISATION_TABLES) {
      const [row] = await tx
        .select({ value: count() })
        .from(table)
        .where(eq(table.organisationId, organisationId));
      plan.tables[getTableName(table)] = row?.value ?? 0;
    }
  });
  for (const table of [member, invitation]) {
    const [row] = await db
      .select({ value: count() })
      .from(table)
      .where(eq(table.organisationId, organisationId));
    plan.tables[getTableName(table)] = row?.value ?? 0;
  }
  const accounts = await memberAccounts(db, organisationId);
  plan.usersToDelete = accounts.toDelete.map((account) => account.email);
  plan.usersToKeep = accounts.toKeep.map((account) => account.email);
  return plan;
}

/**
 * Supprime l'organisation, ses données, les comptes sans autre organisation, puis ses fichiers.
 * Les fichiers partent après la transaction : si leur suppression échoue, relancer la commande
 * avec l'identifiant de l'organisation termine le travail.
 */
export async function deleteOrganisation(
  deps: { db: Database; storage: Storage; queue: Pick<ExtractionQueue, 'discard'> },
  organisationId: string,
): Promise<DeletionResult> {
  const { db, storage, queue } = deps;
  const result: DeletionResult = { tables: {}, usersDeleted: [], usersKept: [], files: 0 };

  const found = await db.query.organisation.findFirst({
    where: eq(organisation.id, organisationId),
  });
  if (found) {
    // Une extraction en cours écrirait encore dans le stockage : on attend qu'elle se termine.
    const imports = await withOrganisation(db, organisationId, (tx) =>
      tx.select({ id: reportImport.id }).from(reportImport),
    );
    for (const { id } of imports) {
      if (!(await queue.discard(id))) {
        throw new DeletionError(
          'Un rapport est en cours d’analyse : réessayer dans quelques minutes.',
        );
      }
    }

    const accounts = await memberAccounts(db, organisationId);
    await withOrganisation(db, organisationId, async (tx) => {
      for (const { table } of [...ORGANISATION_TABLES].reverse()) {
        const deleted = await tx
          .delete(table)
          .where(eq(table.organisationId, organisationId))
          .returning({ organisationId: table.organisationId });
        result.tables[getTableName(table)] = deleted.length;
      }
      for (const table of [invitation, member]) {
        const deleted = await tx
          .delete(table)
          .where(eq(table.organisationId, organisationId))
          .returning({ id: table.id });
        result.tables[getTableName(table)] = deleted.length;
      }
      await tx
        .update(session)
        .set({ activeOrganisationId: null })
        .where(eq(session.activeOrganisationId, organisationId));
      await tx.delete(organisation).where(eq(organisation.id, organisationId));

      // Un ancien membre d'une autre organisation peut y être encore cité (auteur d'une preuve,
      // d'un import) : la clé étrangère refuse alors la suppression et le compte est conservé.
      for (const account of accounts.toDelete) {
        try {
          await tx.transaction((savepoint) =>
            savepoint.delete(user).where(eq(user.id, account.id)),
          );
          result.usersDeleted.push(account.email);
        } catch (error) {
          if (!isForeignKeyViolation(error)) throw error;
          result.usersKept.push(account.email);
        }
      }
    });
  }

  const files = await storage.list(organisationPrefix(organisationId));
  await storage.removeMany(files.map((file) => file.key));
  result.files = files.length;
  return result;
}
