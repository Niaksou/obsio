import {
  extractionOutcomeSchema,
  Q18_CONSTATATIONS,
  reportImportKeys,
  type ExtractedReserve,
  type ProviderReport,
} from '@obsio/shared';
import { and, eq, isNull, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import {
  building,
  draftReserve,
  equipment,
  floor,
  reportDocument,
  reportImport,
  reserve,
  reserveSource,
} from '../db/schema/index.js';
import type { Storage } from '../storage.js';
import { bestMatch, proposeEquipment, type ComparableReserve } from './matching.js';
import type { ExtractionQueue } from './queue.js';

/**
 * Range le résultat d'une extraction terminée : documents et brouillons de réserves (statut
 * `a_valider`), ou l'erreur (statut `erreur`). Sans effet si l'import n'est plus en analyse ou si
 * l'extraction tourne encore : on peut l'appeler à la fin de la tâche et à chaque consultation.
 */
export async function ingestImport(
  deps: { db: Database; storage: Storage; queue: ExtractionQueue },
  organisationId: string,
  importId: string,
): Promise<void> {
  const keys = reportImportKeys(organisationId, importId);
  const raw = await deps.storage.get(keys.extraction);
  const failure = raw ? null : await deps.queue.failure(importId);
  if (!raw && !failure) return;

  await withOrganisation(deps.db, organisationId, async (tx) => {
    // Verrou : deux ingestions simultanées (fin de tâche et consultation) ne doublent rien.
    const [row] = await tx
      .select()
      .from(reportImport)
      .where(eq(reportImport.id, importId))
      .for('update');
    if (!row || row.status !== 'en_analyse') return;

    if (!raw) {
      await tx
        .update(reportImport)
        .set({ status: 'erreur', error: failure })
        .where(eq(reportImport.id, importId));
      return;
    }
    const outcome = extractionOutcomeSchema.safeParse(JSON.parse(raw.toString('utf-8')));
    if (!outcome.success) {
      await tx
        .update(reportImport)
        .set({ status: 'erreur', error: "Résultat d'extraction illisible." })
        .where(eq(reportImport.id, importId));
      return;
    }
    if (outcome.data.status === 'error') {
      await tx
        .update(reportImport)
        .set({ status: 'erreur', error: outcome.data.error, trace: outcome.data.trace })
        .where(eq(reportImport.id, importId));
      return;
    }
    await createDrafts(tx, row, outcome.data.report);
    await tx
      .update(reportImport)
      .set({ status: 'a_valider', error: null, trace: outcome.data.trace })
      .where(eq(reportImport.id, importId));
  });
}

type ImportRow = typeof reportImport.$inferSelect;

/** Équipements actifs du site, candidats au rapprochement. */
function siteEquipment(tx: Transaction, siteId: string) {
  return tx
    .select({ id: equipment.id, name: equipment.name, aliases: equipment.aliases })
    .from(equipment)
    .innerJoin(floor, eq(floor.id, equipment.floorId))
    .innerJoin(building, eq(building.id, floor.buildingId))
    .where(
      and(
        eq(building.siteId, siteId),
        isNull(equipment.archivedAt),
        isNull(floor.archivedAt),
        isNull(building.archivedAt),
      ),
    );
}

/**
 * Réserves encore en cours sur le site (non levées, pas déjà reconduites), avec le code
 * d'observation et la localisation de leurs sources, candidates à une reconduite.
 */
export async function openSiteReserves(tx: Transaction, siteId: string) {
  const successor = alias(reserve, 'successor');
  const rows = await tx
    .select({
      id: reserve.id,
      description: reserve.description,
      equipmentId: reserve.equipmentId,
      codeObservation: sql<string | null>`min(${reserveSource.codeObservation})`,
      localisation: sql<string | null>`min(${reserveSource.localisationTexte})`,
      reference: sql<string | null>`min(${reserveSource.reference})`,
    })
    .from(reserve)
    .leftJoin(reserveSource, eq(reserveSource.reserveId, reserve.id))
    .where(
      and(
        eq(reserve.siteId, siteId),
        sql`${reserve.status} <> 'levee'`,
        notExists(
          tx
            .select({ id: successor.id })
            .from(successor)
            .where(eq(successor.reconduiteDeId, reserve.id)),
        ),
      ),
    )
    .groupBy(reserve.id);
  return rows;
}

const comparable = (
  id: string,
  extracted: ExtractedReserve,
  equipmentId: string | null,
): ComparableReserve => ({
  id,
  description: extracted.description,
  equipmentId,
  codeObservation: extracted.codeObservation,
  localisation: extracted.localisationTexte,
});

/** Documents et brouillons d'une extraction réussie (exporté pour la démonstration). */
export async function createDrafts(tx: Transaction, row: ImportRow, report: ProviderReport) {
  const candidates = await siteEquipment(tx, row.siteId);
  const open = await openSiteReserves(tx, row.siteId);
  // Brouillons déjà créés pour les documents précédents du fichier (rapprochement multi-sources).
  const earlier: ComparableReserve[] = [];
  let position = 0;

  for (const [index, document] of report.documents.entries()) {
    const [doc] = await tx
      .insert(reportDocument)
      .values({
        organisationId: row.organisationId,
        importId: row.id,
        siteId: row.siteId,
        position: index,
        type: document.type,
        organisme: document.organisme,
        numeroRapport: document.numeroRapport,
        dateVisite: document.dateVisite,
        q18: document.q18,
        q19: document.q19,
      })
      .returning({ id: reportDocument.id });

    const extracted: {
      reserve: ExtractedReserve;
      confiance: number | null;
      origin: 'extraction' | 'constatation_q18';
    }[] = document.reserves.map(({ confiance, ...reserve }) => ({
      reserve,
      confiance,
      origin: 'extraction',
    }));

    // Q18 : constatation cochée en danger sans point rattaché → proposée, jamais inventée.
    const pages = document.reserves.map((r) => r.pageSource);
    const firstPage = pages.length > 0 ? Math.min(...pages) : 1;
    for (const constatation of document.q18?.constatations ?? []) {
      const danger =
        constatation.etat === 'danger_nouveau' || constatation.etat === 'danger_deja_signale';
      const covered = document.reserves.some((r) => r.constatationQ18 === constatation.numero);
      if (!danger || covered) continue;
      extracted.push({
        origin: 'constatation_q18',
        confiance: null,
        reserve: {
          reference: `Constatation ${constatation.numero}`,
          codeObservation: null,
          description: Q18_CONSTATATIONS[constatation.numero]!,
          preconisation: null,
          articleReglementaire: null,
          localisationTexte: null,
          gravite: null,
          nouvelleOuReconduite:
            constatation.etat === 'danger_deja_signale' ? 'reconduite' : 'nouvelle',
          pageSource: firstPage,
          constatationQ18: constatation.numero,
          thermique: null,
        },
      });
    }

    const current: ComparableReserve[] = [];
    for (const item of extracted) {
      const id = crypto.randomUUID();
      const equipmentId = proposeEquipment(item.reserve.localisationTexte, candidates);
      const self = comparable(id, item.reserve, equipmentId);
      const mergeIntoId = item.origin === 'extraction' ? bestMatch(self, earlier) : null;
      const reconduiteDeId = mergeIntoId ? null : bestMatch(self, open);
      await tx.insert(draftReserve).values({
        id,
        organisationId: row.organisationId,
        importId: row.id,
        documentId: doc!.id,
        position: position++,
        origin: item.origin,
        extracted: item.reserve,
        confiance: item.confiance,
        description: item.reserve.description,
        preconisation: item.reserve.preconisation,
        gravite: item.reserve.gravite,
        equipmentId,
        proposedEquipmentId: equipmentId,
        reconduiteDeId,
        proposedReconduiteDeId: reconduiteDeId,
        mergeIntoId,
        proposedMergeIntoId: mergeIntoId,
      });
      if (!mergeIntoId) current.push(self);
    }
    earlier.push(...current);
  }
}
