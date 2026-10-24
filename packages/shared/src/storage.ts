/**
 * Clés des objets d'un import de rapport. Préfixées par l'organisation pour que
 * le cloisonnement se lise aussi dans le stockage.
 */
export function reportImportKeys(organisationId: string, importId: string) {
  const base = `organisations/${organisationId}/imports/${importId}`;
  return {
    pdf: `${base}/rapport.pdf`,
    /** Résultat de l'OCR, réutilisé si la tâche est relancée (l'OCR est facturé à la page). */
    ocr: `${base}/ocr.json`,
    extraction: `${base}/extraction.json`,
  };
}
