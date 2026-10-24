import type { ExtractedReport, ExtractedReserve } from '@obsio/shared';

// Comparaison d'une extraction avec le résultat attendu. Le texte est comparé après normalisation
// (casse, accents, ponctuation, espaces) pour ne pas compter comme erreur une différence de mise en forme.

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Similarité entre 0 et 1 de deux textes normalisés ; deux valeurs nulles sont identiques. */
export function similarity(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 1 : 0;
  const [x, y] = [normalize(a), normalize(b)];
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Seuils au-delà desquels un champ texte est jugé correct. */
const THRESHOLDS = {
  description: 0.9,
  preconisation: 0.9,
  articleReglementaire: 0.85,
  localisationTexte: 0.8,
  gravite: 0.9,
} as const;

export const RESERVE_FIELDS = [
  'description',
  'preconisation',
  'articleReglementaire',
  'localisationTexte',
  'gravite',
  'nouvelleOuReconduite',
  'pageSource',
] as const;
export type ReserveField = (typeof RESERVE_FIELDS)[number];

export interface FieldError {
  reference: string;
  field: ReserveField;
  expected: unknown;
  actual: unknown;
}

export interface ReportComparison {
  expectedCount: number;
  matched: number;
  missing: string[];
  invented: string[];
  fieldsCorrect: Record<ReserveField, number>;
  fieldErrors: FieldError[];
  headerErrors: { field: string; expected: unknown; actual: unknown }[];
}

function fieldCorrect(field: ReserveField, expected: ExtractedReserve, actual: ExtractedReserve) {
  if (field === 'nouvelleOuReconduite' || field === 'pageSource') {
    return expected[field] === actual[field];
  }
  return similarity(expected[field], actual[field]) >= THRESHOLDS[field];
}

/** Vrai si l'un des deux noms normalisés contient l'autre (« SOCOTEC » et « SOCOTEC Equipements »). */
function sameName(a: string, b: string): boolean {
  const [x, y] = [normalize(a), normalize(b)];
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

export function compareReport(
  expected: ExtractedReport,
  actual: Pick<ExtractedReport, keyof ExtractedReport>,
): ReportComparison {
  const key = (reference: string) => normalize(reference).replace(/^0+(?=\d)/, '');
  const actualByRef = new Map(actual.reserves.map((r) => [key(r.reference), r]));
  const expectedRefs = new Set(expected.reserves.map((r) => key(r.reference)));

  const fieldsCorrect = Object.fromEntries(RESERVE_FIELDS.map((f) => [f, 0])) as Record<
    ReserveField,
    number
  >;
  const fieldErrors: FieldError[] = [];
  const missing: string[] = [];
  let matched = 0;

  for (const reserve of expected.reserves) {
    const found = actualByRef.get(key(reserve.reference));
    if (!found) {
      missing.push(reserve.reference);
      continue;
    }
    matched += 1;
    for (const field of RESERVE_FIELDS) {
      if (fieldCorrect(field, reserve, found)) fieldsCorrect[field] += 1;
      else {
        fieldErrors.push({
          reference: reserve.reference,
          field,
          expected: reserve[field],
          actual: found[field],
        });
      }
    }
  }

  const headerErrors: ReportComparison['headerErrors'] = [];
  const checkHeader = (field: string, ok: boolean, exp: unknown, act: unknown) => {
    if (!ok) headerErrors.push({ field, expected: exp, actual: act });
  };
  checkHeader(
    'organisme',
    sameName(expected.organisme, actual.organisme),
    expected.organisme,
    actual.organisme,
  );
  checkHeader(
    'typeVerification',
    expected.typeVerification === actual.typeVerification,
    expected.typeVerification,
    actual.typeVerification,
  );
  checkHeader(
    'dateVisite',
    expected.dateVisite === actual.dateVisite,
    expected.dateVisite,
    actual.dateVisite,
  );
  checkHeader(
    'site.nom',
    sameName(expected.site.nom, actual.site.nom),
    expected.site.nom,
    actual.site.nom,
  );
  checkHeader(
    'numeroRapport',
    similarity(expected.numeroRapport, actual.numeroRapport) === 1,
    expected.numeroRapport,
    actual.numeroRapport,
  );

  return {
    expectedCount: expected.reserves.length,
    matched,
    missing,
    invented: actual.reserves.map((r) => r.reference).filter((ref) => !expectedRefs.has(key(ref))),
    fieldsCorrect,
    fieldErrors,
    headerErrors,
  };
}
