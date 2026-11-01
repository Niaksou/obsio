import {
  DEFAULT_PERIODICITY_MONTHS,
  INSPECTION_KINDS,
  inspectionState,
  type DocumentType,
  type Inspection,
  type InspectionKind,
} from '@obsio/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import { inspectionPlan, reportDocument, reportImport, site } from '../db/schema/index.js';
import { today } from '../reserves/queries.js';

/** Documents qui comptent comme visite pour chaque type de vérification suivi. */
export const KIND_DOCUMENTS: Record<InspectionKind, DocumentType[]> = {
  // La vérification initiale (mise en service) fait partir l'échéance de la périodique.
  periodique: ['periodique', 'initiale'],
  q18: ['q18'],
  q19: ['q19'],
};

const kindOf = (type: DocumentType) =>
  INSPECTION_KINDS.find((kind) => KIND_DOCUMENTS[kind].includes(type));

/** Échéancier des sites actifs (ou d'un seul), trié par site puis par type. */
export async function listInspections(
  tx: Transaction,
  { siteId, on = today() }: { siteId?: string; on?: string } = {},
): Promise<Inspection[]> {
  const sites = await tx
    .select({ id: site.id, name: site.name })
    .from(site)
    .where(and(isNull(site.archivedAt), siteId ? eq(site.id, siteId) : undefined))
    .orderBy(asc(site.name));
  if (sites.length === 0) return [];
  const siteIds = sites.map((s) => s.id);

  const plans = await tx
    .select()
    .from(inspectionPlan)
    .where(inArray(inspectionPlan.siteId, siteIds));
  // Rapports validés, du plus récent au plus ancien : le premier de chaque type est la dernière visite.
  const documents = await tx
    .select({
      siteId: reportDocument.siteId,
      type: reportDocument.type,
      dateVisite: reportDocument.dateVisite,
      organisme: reportDocument.organisme,
      importId: reportDocument.importId,
    })
    .from(reportDocument)
    .innerJoin(reportImport, eq(reportImport.id, reportDocument.importId))
    .where(
      and(
        inArray(reportDocument.siteId, siteIds),
        eq(reportImport.status, 'valide'),
        isNotNull(reportDocument.dateVisite),
      ),
    )
    .orderBy(desc(reportDocument.dateVisite));

  const lastVisits = new Map<string, Inspection['lastVisit']>();
  for (const d of documents) {
    const kind = kindOf(d.type);
    const key = `${d.siteId}:${kind}`;
    if (kind && !lastVisits.has(key)) {
      lastVisits.set(key, { date: d.dateVisite!, organisme: d.organisme, importId: d.importId });
    }
  }

  return sites.flatMap((s) =>
    INSPECTION_KINDS.map((kind) => {
      const plan = plans.find((p) => p.siteId === s.id && p.kind === kind);
      const lastVisit = lastVisits.get(`${s.id}:${kind}`) ?? null;
      const enabled = plan?.enabled ?? true;
      const periodicityMonths = plan?.periodicityMonths ?? DEFAULT_PERIODICITY_MONTHS;
      return {
        siteId: s.id,
        siteName: s.name,
        kind,
        enabled,
        periodicityMonths,
        lastVisit,
        contact: plan?.contact ?? null,
        ...inspectionState(
          {
            enabled,
            periodicityMonths,
            lastVisitDate: lastVisit?.date ?? null,
            plannedDate: plan?.plannedDate ?? null,
          },
          on,
        ),
      };
    }),
  );
}
