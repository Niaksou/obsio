import type { ContractorReserve } from '@obsio/shared';

/** « 3 en cours, dont 1 en retard · 1 corrigée à vérifier » ; « Rien en cours ». */
export function summary(reserves: ContractorReserve[]) {
  const inProgress = reserves.filter((r) => r.status === 'assignee');
  const overdue = inProgress.filter((r) => r.overdue).length;
  const corrected = reserves.length - inProgress.length;
  const parts = [];
  if (inProgress.length > 0) {
    parts.push(`${inProgress.length} en cours${overdue > 0 ? `, dont ${overdue} en retard` : ''}`);
  }
  if (corrected > 0) parts.push(`${corrected} corrigée${corrected > 1 ? 's' : ''} à vérifier`);
  return parts.length > 0 ? parts.join(' · ') : 'Rien en cours.';
}
