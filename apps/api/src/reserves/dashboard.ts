import type { SiteDashboard } from '@obsio/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import { reportDocument, reportImport } from '../db/schema/index.js';
import { listReserves, today } from './queries.js';

/** Tableau de bord d'un site : où en sont les réserves, et ce que dit le dernier Q18. */
export async function siteDashboard(tx: Transaction, siteId: string): Promise<SiteDashboard> {
  const on = today();
  const reserves = await listReserves(tx, siteId);
  const open = reserves.filter((r) => r.status === 'ouverte' || r.status === 'assignee');

  const floors = new Map<string, SiteDashboard['floors'][number]>();
  for (const r of open) {
    if (!r.equipment) continue;
    const floor = floors.get(r.equipment.floorId) ?? {
      floorId: r.equipment.floorId,
      floorName: r.equipment.floorName,
      buildingName: r.equipment.buildingName,
      open: 0,
      overdue: 0,
    };
    floor.open += 1;
    if (r.overdue) floor.overdue += 1;
    floors.set(floor.floorId, floor);
  }

  const [q18] = await tx
    .select({ document: reportDocument })
    .from(reportDocument)
    .innerJoin(reportImport, eq(reportImport.id, reportDocument.importId))
    .where(
      and(
        eq(reportDocument.siteId, siteId),
        eq(reportDocument.type, 'q18'),
        eq(reportImport.status, 'valide'),
      ),
    )
    .orderBy(sql`${reportDocument.dateVisite} desc nulls last`, desc(reportImport.validatedAt))
    .limit(1);
  const summary = q18?.document.q18;

  return {
    counts: {
      open: open.length,
      overdue: open.filter((r) => r.dueDate !== null && r.dueDate < on).length,
      toVerify: reserves.filter((r) => r.status === 'corrigee').length,
      reconduites: open.filter((r) => r.reconduite).length,
      levees: reserves.filter((r) => r.status === 'levee').length,
    },
    floors: [...floors.values()].sort((a, b) =>
      `${a.buildingName} ${a.floorName}`.localeCompare(`${b.buildingName} ${b.floorName}`, 'fr', {
        numeric: true,
      }),
    ),
    unattached: open.filter((r) => !r.equipment).length,
    q18: q18
      ? {
          importId: q18.document.importId,
          organisme: q18.document.organisme,
          dateVisite: q18.document.dateVisite,
          conclusion: summary?.conclusion ?? null,
          dangers: (summary?.constatations ?? [])
            .filter((c) => c.etat === 'danger_nouveau' || c.etat === 'danger_deja_signale')
            .map((c) => c.numero),
          nonVerifiees: (summary?.constatations ?? [])
            .filter((c) => c.etat === 'non_verifie')
            .map((c) => c.numero),
        }
      : null,
  };
}
