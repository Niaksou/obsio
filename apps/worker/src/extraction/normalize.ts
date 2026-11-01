import type { ProviderReport } from '@obsio/shared';

type Document = ProviderReport['documents'][number];
type Reserve = Document['reserves'][number];

/** Nombre de champs renseignés : départage deux lectures d'une même réserve. */
function filled(reserve: Reserve) {
  return Object.values(reserve).filter((value) => value !== null && value !== '').length;
}

function mergeReserves(first: Reserve[], second: Reserve[]): Reserve[] {
  const merged = [...first];
  for (const reserve of second) {
    const index = merged.findIndex((r) => r.reference === reserve.reference);
    if (index === -1) {
      merged.push(reserve);
      continue;
    }
    const current = merged[index]!;
    // La version la plus complète l'emporte ; à égalité, la page la plus loin (les fiches
    // détaillées suivent la synthèse).
    const better =
      filled(reserve) > filled(current) ||
      (filled(reserve) === filled(current) && reserve.pageSource > current.pageSource);
    if (better) merged[index] = reserve;
  }
  return merged;
}

/**
 * Le modèle sépare parfois un même document en deux (synthèse d'un Q19 puis ses fiches
 * d'anomalie) : deux documents du même type et du même numéro n'en font qu'un, sans réserve
 * en double. La sortie brute du modèle reste dans la trace.
 */
export function mergeDuplicateDocuments(report: ProviderReport): ProviderReport {
  const documents: Document[] = [];
  for (const document of report.documents) {
    const twin = documents.find(
      (d) =>
        d.type === document.type &&
        d.numeroRapport !== null &&
        d.numeroRapport === document.numeroRapport,
    );
    if (!twin) {
      documents.push(document);
      continue;
    }
    documents[documents.indexOf(twin)] = {
      ...twin,
      organisme: twin.organisme || document.organisme,
      dateVisite: twin.dateVisite ?? document.dateVisite,
      q18: twin.q18 ?? document.q18,
      q19: twin.q19 ?? document.q19,
      reserves: mergeReserves(twin.reserves, document.reserves),
    };
  }
  return { ...report, documents };
}
