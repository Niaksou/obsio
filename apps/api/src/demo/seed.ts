import { floorPlanPrefix, proofPhotoPrefix, reportImportKeys } from '@obsio/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import {
  assignment,
  assignmentReserve,
  building,
  contractor,
  draftReserve,
  equipment,
  floor,
  inspectionPlan,
  member,
  organisation,
  reportImport,
  reserve,
  site,
  user,
} from '../db/schema/index.js';
import { activateImport } from '../imports/activate.js';
import { createDrafts } from '../imports/ingest.js';
import { recordEvent } from '../reserves/events.js';
import { addProof } from '../reserves/proofs.js';
import { today } from '../reserves/queries.js';
import { hashToken } from '../routes/reserves.js';
import type { Storage } from '../storage.js';
import {
  CONTRACTORS,
  LYON,
  lyonLastYear,
  lyonThermography,
  lyonThisYear,
  ORGANISME,
  shift,
  villefrancheReport,
  VILLEFRANCHE,
  type DemoReport,
  type DemoSite,
} from './content.js';
import { drawPlan, drawProofPhoto } from './images.js';
import { demoExtraction, demoReportPdf } from './report.js';

// Données de démonstration (pnpm demo:seed) : deux sites complets dans une organisation encore
// vide. Tout passe par les fonctions de l'application (brouillons, validation, preuves) et par
// withOrganisation, pour obtenir exactement ce qu'aurait produit un usage réel.

export class DemoError extends Error {
  override name = 'DemoError';
}

interface Deps {
  db: Database;
  storage: Storage;
  webUrl: string;
}

export interface DemoSummary {
  organisationName: string;
  sites: number;
  reserves: number;
  /** Lien d'intervention de chaque intervenant, pour ouvrir la vue téléphone. */
  links: { contractor: string; url: string }[];
}

/** Organisation dont `email` est administrateur ; `organisationId` départage s'il y en a plusieurs. */
async function findOrganisation(db: Database, email: string, organisationId?: string) {
  const rows = await db
    .select({ userId: user.id, organisationId: organisation.id, name: organisation.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organisation, eq(organisation.id, member.organisationId))
    .where(and(eq(user.email, email.trim().toLowerCase()), eq(member.role, 'admin')));
  const matching = organisationId ? rows.filter((r) => r.organisationId === organisationId) : rows;
  if (matching.length === 0) {
    throw new DemoError(`${email} n'est administrateur d'aucune organisation (compte créé ?).`);
  }
  if (matching.length > 1) {
    const list = matching.map((r) => `  ${r.organisationId}  ${r.name}`).join('\n');
    throw new DemoError(`Plusieurs organisations, préciser --organisation :\n${list}`);
  }
  return matching[0]!;
}

export async function seedDemo(
  { db, storage, webUrl }: Deps,
  input: { adminEmail: string; organisationId?: string; on?: string },
): Promise<DemoSummary> {
  const on = input.on ?? today();
  const target = await findOrganisation(db, input.adminEmail, input.organisationId);
  const orgId = target.organisationId;
  const userId = target.userId;
  const scoped = <T>(fn: (tx: Transaction) => Promise<T>) => withOrganisation(db, orgId, fn);

  // Les sites archivés sont masqués partout : ils n'empêchent pas la démonstration.
  const existing = await scoped((tx) =>
    tx.select({ id: site.id }).from(site).where(isNull(site.archivedAt)).limit(1),
  );
  if (existing.length > 0) {
    throw new DemoError(
      `L'organisation « ${target.name} » contient déjà des sites actifs : la démonstration ne se mélange pas à des données existantes.`,
    );
  }

  // 1. Sites, bâtiments, étages avec plan calibré, équipements.
  const equipmentIds = new Map<string, string>();
  async function createSite(demo: DemoSite) {
    const [created] = await scoped((tx) =>
      tx
        .insert(site)
        .values({ organisationId: orgId, name: demo.name, address: demo.address })
        .returning(),
    );
    for (const b of demo.buildings) {
      const [createdBuilding] = await scoped((tx) =>
        tx
          .insert(building)
          .values({ organisationId: orgId, siteId: created!.id, name: b.name })
          .returning(),
      );
      for (const f of b.floors) {
        const floorId = crypto.randomUUID();
        const imageKey = `${floorPlanPrefix(orgId, floorId)}${crypto.randomUUID()}-image.png`;
        await storage.put(imageKey, drawPlan(f.plan), 'image/png');
        await scoped(async (tx) => {
          await tx.insert(floor).values({
            id: floorId,
            organisationId: orgId,
            buildingId: createdBuilding!.id,
            name: f.name,
            level: f.level,
            planImageKey: imageKey,
            planWidth: f.plan.width,
            planHeight: f.plan.height,
            scale: f.plan.metresPerPixel,
          });
          for (const e of f.equipment) {
            const [row] = await tx
              .insert(equipment)
              .values({
                organisationId: orgId,
                floorId,
                type: e.type,
                name: e.name,
                aliases: e.aliases ?? [],
                x: e.at[0],
                y: e.at[1],
              })
              .returning({ id: equipment.id });
            equipmentIds.set(e.name, row!.id);
          }
        });
      }
    }
    return created!;
  }
  const lyon = await createSite(LYON);
  const villefranche = await createSite(VILLEFRANCHE);

  // 2. Rapports : PDF et sortie d'extraction au stockage, brouillons comme après une vraie
  // extraction, puis validation (sauf `pending`) avec les propositions retenues telles quelles.
  async function importReport(
    siteRow: typeof site.$inferSelect,
    demo: DemoSite,
    report: DemoReport,
    pending = false,
  ) {
    const importId = crypto.randomUUID();
    const keys = reportImportKeys(orgId, importId);
    const outcome = demoExtraction(report, demo);
    await storage.put(keys.pdf, await demoReportPdf(report, demo), 'application/pdf');
    await storage.put(keys.extraction, JSON.stringify(outcome), 'application/json');
    await scoped(async (tx) => {
      const [row] = await tx
        .insert(reportImport)
        .values({
          id: importId,
          organisationId: orgId,
          siteId: siteRow.id,
          fileName: report.fileName,
          pdfKey: keys.pdf,
          status: 'a_valider',
          trace: outcome.trace,
          createdBy: userId,
        })
        .returning();
      if (outcome.status !== 'success') return;
      await createDrafts(tx, row!, outcome.report);
      if (pending) return;
      await tx
        .update(draftReserve)
        .set({ decision: 'retenue' })
        .where(eq(draftReserve.importId, importId));
      await activateImport(tx, row!, userId);
    });
    return importId;
  }

  /** Réserves d'un import, par début de description. */
  async function reservesOf(importId: string) {
    const rows = await scoped((tx) =>
      tx.select().from(reserve).where(eq(reserve.importId, importId)),
    );
    return (start: string) => {
      const found = rows.find((r) => r.description.startsWith(start));
      if (!found) throw new DemoError(`Réserve de démonstration introuvable : ${start}`);
      return found;
    };
  }

  let photo = 0;
  async function photos(reserveId: string, count: number) {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const key = `${proofPhotoPrefix(orgId, reserveId)}${crypto.randomUUID()}.png`;
      await storage.put(key, drawProofPhoto(photo++), 'image/png');
      keys.push(key);
    }
    return keys;
  }

  /** Correction constatée par l'admin (preuve), puis levée. */
  async function lift(reserveId: string, comment: string, photoCount: number) {
    const photoKeys = await photos(reserveId, photoCount);
    await scoped(async (tx) => {
      await addProof(
        tx,
        orgId,
        reserveId,
        { clientId: crypto.randomUUID(), comment, photoKeys, markCorrected: true },
        { userId },
      );
      await tx
        .update(reserve)
        .set({ status: 'levee', closedAt: new Date() })
        .where(eq(reserve.id, reserveId));
      await recordEvent(tx, {
        organisationId: orgId,
        reserveId,
        type: 'levee',
        actorUserId: userId,
        data: { comment: null },
      });
    });
  }

  async function setDueDate(row: typeof reserve.$inferSelect, dueDate: string) {
    await scoped(async (tx) => {
      await tx.update(reserve).set({ dueDate }).where(eq(reserve.id, row.id));
      await recordEvent(tx, {
        organisationId: orgId,
        reserveId: row.id,
        type: 'modifiee',
        actorUserId: userId,
        data: { dueDate: { before: row.dueDate, after: dueDate } },
      });
    });
  }

  // Lyon, l'an dernier : trois réserves levées, deux encore ouvertes (reconduites cette année).
  const lastYear = await reservesOf(await importReport(lyon, LYON, lyonLastYear(on)));
  await lift(lastYear('Absence de repérage').id, 'Repérage refait sur tous les départs.', 2);
  await lift(lastYear('Arrêt d’urgence').id, 'Étiquette posée.', 1);
  await lift(lastYear('Bloc autonome').id, 'Bloc remplacé et testé.', 1);

  // Lyon, cette année : Code du travail et Q18.
  const thisYear = await reservesOf(await importReport(lyon, LYON, lyonThisYear(on)));
  await lift(
    thisYear('Autonomie de l’éclairage').id,
    'Batteries remplacées, essai d’une heure.',
    2,
  );
  await lift(thisYear('Notice et schéma').id, 'Notice rangée dans la salle serveur.', 0);
  await setDueDate(thisYear('Présence importante de poussière'), shift(on, -30));
  await setDueDate(thisYear('Absence de dispositif de coupure'), shift(on, 90));
  await scoped((tx) =>
    recordEvent(tx, {
      organisationId: orgId,
      reserveId: thisYear('Registre de sécurité').id,
      type: 'commentaire',
      actorUserId: userId,
      data: {
        text: 'Demande envoyée au service qualité pour retrouver les rapports 2022 et 2023.',
      },
    }),
  );

  // Intervenants et assignations (liens d'intervention valides).
  const contractorIds = await scoped((tx) =>
    tx
      .insert(contractor)
      .values(CONTRACTORS.map((c) => ({ organisationId: orgId, ...c })))
      .returning(),
  );
  const links: DemoSummary['links'] = [];
  async function assign(
    who: (typeof contractorIds)[number],
    reserves: (typeof reserve.$inferSelect)[],
    dueDate: string,
    validityDays: number,
    message: string,
  ) {
    const token = randomBytes(32).toString('base64url');
    const created = await scoped(async (tx) => {
      const [row] = await tx
        .insert(assignment)
        .values({
          organisationId: orgId,
          contractorId: who.id,
          dueDate,
          message,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + validityDays * 24 * 3600 * 1000),
          createdBy: userId,
        })
        .returning();
      await tx
        .insert(assignmentReserve)
        .values(
          reserves.map((r) => ({ organisationId: orgId, assignmentId: row!.id, reserveId: r.id })),
        );
      for (const r of reserves) {
        await tx.update(reserve).set({ status: 'assignee', dueDate }).where(eq(reserve.id, r.id));
        await recordEvent(tx, {
          organisationId: orgId,
          reserveId: r.id,
          type: 'assignee',
          actorUserId: userId,
          data: {
            assignmentId: row!.id,
            contractor: who.name,
            dueDate,
            before: { status: r.status, dueDate: r.dueDate },
          },
        });
      }
      return row!;
    });
    links.push({ contractor: who.name, url: `${webUrl}/intervention/${token}` });
    return created;
  }

  const [karim, sophie] = contractorIds;
  const karimJob = await assign(
    karim!,
    [
      thisYear('Dispositif différentiel'),
      thisYear('Échauffement anormal'),
      thisYear('Absence de continuité'),
      thisYear('Porte de l’armoire'),
      thisYear('Câble souple endommagé'),
    ],
    shift(on, 40),
    30,
    'Priorité au différentiel du TD1 et à la terre du Tour CN 2.',
  );
  await assign(
    sophie!,
    [thisYear('Calibre du disjoncteur'), thisYear('Prise de courant sans obturateur')],
    shift(on, -18),
    90,
    'Intervention aux bureaux, à caler avec l’accueil.',
  );

  // L'intervenant a déjà corrigé deux points depuis son téléphone : à lever par l'admin.
  for (const [start, comment] of [
    ['Câble souple endommagé', 'Câble et presse-étoupe remplacés.'],
    ['Porte de l’armoire', 'Serrure changée, deux clés remises au responsable maintenance.'],
  ] as const) {
    const target = thisYear(start);
    const photoKeys = await photos(target.id, 2);
    await scoped((tx) =>
      addProof(
        tx,
        orgId,
        target.id,
        { clientId: crypto.randomUUID(), comment, photoKeys, markCorrected: true },
        { contractorId: karim!.id, assignmentId: karimJob.id },
      ),
    );
  }

  // Thermographie à relire, et Villefranche.
  await importReport(lyon, LYON, lyonThermography(on), true);
  const vf = await reservesOf(
    await importReport(villefranche, VILLEFRANCHE, villefrancheReport(on)),
  );
  await lift(vf('Câble du chargeur').id, 'Câble passé en goulotte aérienne.', 1);
  await setDueDate(vf('Différentiel du circuit des quais'), shift(on, -45));

  // Échéancier : visite Q18 déjà convenue à Lyon ; contact de l'organisme à Villefranche.
  await scoped((tx) =>
    tx.insert(inspectionPlan).values([
      {
        organisationId: orgId,
        siteId: lyon.id,
        kind: 'q18',
        periodicityMonths: 12,
        plannedDate: shift(on, 100),
        contact: `${ORGANISME}, M. Durand, 04 00 00 00 00`,
      },
      {
        organisationId: orgId,
        siteId: villefranche.id,
        kind: 'periodique',
        periodicityMonths: 12,
        contact: `${ORGANISME}, agence de Villefranche`,
      },
    ]),
  );

  const total = await scoped((tx) =>
    tx
      .select({ id: reserve.id })
      .from(reserve)
      .where(inArray(reserve.siteId, [lyon.id, villefranche.id])),
  );
  return { organisationName: target.name, sites: 2, reserves: total.length, links };
}
