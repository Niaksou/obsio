// Rapprochements proposés à la validation d'un import (spec, « Pipeline d'extraction », étape 5).
// Ce ne sont que des propositions : l'utilisateur les confirme ou les corrige.

/** Minuscules, sans accents, ponctuation remplacée par des espaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const tokens = (text: string) => normalize(text).split(' ').filter(Boolean);

/**
 * Vrai si le nom apparaît dans la localisation comme suite de mots entiers, espaces ignorés
 * entre les mots (« TD 2 » correspond à « TD2 », mais « TD » ne correspond pas à « TD2 »).
 */
export function containsName(localisation: string, name: string): boolean {
  const target = tokens(name).join('');
  if (!target) return false;
  const words = tokens(localisation);
  for (let start = 0; start < words.length; start++) {
    let joined = '';
    for (let end = start; end < words.length && joined.length < target.length; end++) {
      joined += words[end];
      if (joined === target) return true;
    }
  }
  return false;
}

export interface EquipmentCandidate {
  id: string;
  name: string;
  aliases: string[];
}

/**
 * Équipement dont le repère ou un alias figure dans la localisation du rapport. Le nom le plus
 * long l'emporte (« TD2 atelier » plutôt que « atelier ») ; en cas d'égalité, pas de proposition.
 */
export function proposeEquipment(
  localisation: string | null,
  candidates: EquipmentCandidate[],
): string | null {
  if (!localisation) return null;
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const candidate of candidates) {
    const score = Math.max(
      0,
      ...[candidate.name, ...candidate.aliases]
        .filter((name) => containsName(localisation, name))
        .map((name) => tokens(name).join('').length),
    );
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { id: candidate.id, score };
      tie = false;
    } else if (score === best.score && candidate.id !== best.id) {
      tie = true;
    }
  }
  return best && !tie ? best.id : null;
}

/** Similarité de Jaccard sur les mots significatifs (3 lettres ou plus). */
export function similarity(a: string, b: string): number {
  const words = (text: string) => new Set(tokens(text).filter((word) => word.length >= 3));
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return common / (left.size + right.size - common);
}

export interface ComparableReserve {
  id: string;
  description: string;
  equipmentId: string | null;
  codeObservation: string | null;
  localisation: string | null;
}

/**
 * Même anomalie ? Même code d'observation de l'organisme ; sinon texte proche, plus exigeant
 * quand rien d'autre (équipement, localisation) ne les relie.
 */
export function sameAnomaly(a: ComparableReserve, b: ComparableReserve): number {
  if (a.codeObservation && b.codeObservation) {
    return normalize(a.codeObservation) === normalize(b.codeObservation) ? 1 : 0;
  }
  const text = similarity(a.description, b.description);
  const samePlace =
    (a.equipmentId !== null && a.equipmentId === b.equipmentId) ||
    (a.localisation !== null &&
      b.localisation !== null &&
      normalize(a.localisation) === normalize(b.localisation));
  const threshold = samePlace ? 0.5 : 0.75;
  return text >= threshold ? text : 0;
}

/** Meilleure correspondance parmi les candidats, ou null. */
export function bestMatch(
  reserve: ComparableReserve,
  candidates: ComparableReserve[],
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = sameAnomaly(reserve, candidate);
    if (score > 0 && (!best || score > best.score)) best = { id: candidate.id, score };
  }
  return best?.id ?? null;
}
