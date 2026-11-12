// Géométrie des contours de zone : polygones en proportion de l'image du plan (0 à 1).
// Partagée pour que le navigateur et l'API valident un contour de la même façon.

export interface PolygonPoint {
  x: number;
  y: number;
}

/** Surface (formule du lacet), toujours positive. */
export function polygonArea(points: PolygonPoint[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const cross = (o: PolygonPoint, a: PolygonPoint, b: PolygonPoint) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Les segments [a, b] et [c, d] se croisent franchement (pas seulement en se touchant). */
function crosses(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Aucun côté n'en croise un autre (contour en « 8 » refusé). */
export function isSimplePolygon(points: PolygonPoint[]) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Côtés voisins : ils partagent un sommet.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (crosses(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return false;
      }
    }
  }
  return true;
}

/** Point dans le polygone (lancer de rayon). */
export function polygonContains(points: PolygonPoint[], point: PolygonPoint) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Plus petit rectangle qui contient le contour. */
export function polygonBounds(points: PolygonPoint[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Surface minimale d'une zone, en proportion du plan (un carré d'environ 1 % de côté). */
export const MIN_ZONE_AREA = 0.0001;
