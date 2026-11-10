// Tutoriels interactifs : une suite d'étapes courtes, chacune attachée à un élément réel de la
// page (attribut data-tour). Une étape dont l'élément est absent (droits, page vide) est sautée.

export interface TourStep {
  /** Valeur de l'attribut data-tour visé ; absent : bulle centrée. */
  target?: string;
  title: string;
  /** Une phrase courte. */
  body: string;
  /** Étape à faire : elle avance quand l'utilisateur touche l'élément. */
  action?: 'click';
}

export interface Tour {
  id: string;
  title: string;
  /** Pages où le tutoriel a un sens. */
  match: (path: string) => boolean;
  /** Lancé tout seul à la première visite d'une page qui correspond. */
  auto?: boolean;
  steps: TourStep[];
}

const SEEN_KEY = 'obsio-tutoriels-vus';

function readSeen(storage: Storage): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function hasSeen(id: string, storage: Storage = localStorage) {
  return readSeen(storage).includes(id);
}

export function markSeen(id: string, storage: Storage = localStorage) {
  const seen = readSeen(storage);
  if (!seen.includes(id)) storage.setItem(SEEN_KEY, JSON.stringify([...seen, id]));
}

/** Les tutoriels automatiques se relanceront à la prochaine visite. */
export function resetSeen(storage: Storage = localStorage) {
  storage.removeItem(SEEN_KEY);
}

/** Étapes jouables : bulle centrée, ou élément présent dans la page. */
export function playableSteps(steps: TourStep[], exists: (target: string) => boolean) {
  return steps.filter((step) => !step.target || exists(step.target));
}

/** Tutoriels à proposer sur cette page : au moins une étape attachée à un élément présent. */
export function toursFor(tours: Tour[], path: string, exists: (target: string) => boolean): Tour[] {
  return tours.filter(
    (tour) => tour.match(path) && tour.steps.some((step) => step.target && exists(step.target)),
  );
}

/** Premier tutoriel automatique pas encore vu pour cette page. */
export function autoTourFor(tours: Tour[], path: string, seen: (id: string) => boolean) {
  return tours.find((tour) => tour.auto && tour.match(path) && !seen(tour.id)) ?? null;
}

export type Placement = 'below' | 'above' | 'center' | 'sheet' | 'sheet-top';

/**
 * Position de la bulle : sous l'élément, sinon au-dessus, sinon centrée ; en bas de l'écran
 * sur un téléphone (à portée du pouce), ou en haut si l'élément est dans la moitié basse
 * (barre d'onglets).
 */
export function placeBubble(
  target: { top: number; bottom: number; left: number; width: number } | null,
  viewport: { width: number; height: number },
  bubble: { width: number; height: number },
  margin = 12,
): { placement: Placement; top: number; left: number } {
  if (viewport.width <= 720) {
    if (target && target.top > viewport.height / 2) {
      return { placement: 'sheet-top', top: margin, left: margin };
    }
    return { placement: 'sheet', top: viewport.height - bubble.height - margin, left: margin };
  }
  const centered = {
    top: Math.max(margin, (viewport.height - bubble.height) / 2),
    left: Math.max(margin, (viewport.width - bubble.width) / 2),
  };
  if (!target) return { placement: 'center', ...centered };
  const left = Math.min(
    Math.max(margin, target.left + target.width / 2 - bubble.width / 2),
    viewport.width - bubble.width - margin,
  );
  if (target.bottom + margin + bubble.height <= viewport.height - margin) {
    return { placement: 'below', top: target.bottom + margin, left };
  }
  if (target.top - margin - bubble.height >= margin) {
    return { placement: 'above', top: target.top - margin - bubble.height, left };
  }
  return { placement: 'center', ...centered };
}
