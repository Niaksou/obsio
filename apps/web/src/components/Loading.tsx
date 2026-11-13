/** Silhouette du contenu attendu, pour que la page ne saute pas à l'arrivée des données. */
export type LoadingShape = 'list' | 'detail' | 'plan' | 'bar';

/**
 * État de chargement : fine barre en haut de l'écran (seule animation) et silhouette grise
 * de la page attendue. Rien ne s'affiche pendant les 200 premières millisecondes ; les lecteurs
 * d'écran entendent « Chargement » tout de suite.
 *
 * - `shape` : liste de lignes, fiche (bloc principal et colonne), plan plein cadre, ou barre
 *   seule quand la page attendue n'est pas encore connue.
 * - `inline` : sans titre, sous l'en-tête déjà affiché d'une page.
 * - `page` : marges des pages en plein écran (plan, rapport, vue 3D).
 */
export function Loading({
  shape = 'list',
  inline = false,
  page = false,
}: {
  shape?: LoadingShape;
  inline?: boolean;
  page?: boolean;
}) {
  const className = ['loading-state', `loading-${shape}`, page && 'page-message']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} role="status">
      <span className="visually-hidden">Chargement</span>
      <span className="loading-bar" aria-hidden />
      {shape !== 'bar' && (
        <div className="loading-skeleton" aria-hidden>
          {!inline && <span className="skeleton-title" />}
          {shape === 'list' &&
            Array.from({ length: inline ? 3 : 5 }, (_, i) => (
              <span key={i} className="skeleton-row" />
            ))}
          {shape === 'detail' && (
            <span className="skeleton-columns">
              <span className="skeleton-block" />
              <span className="skeleton-block side" />
            </span>
          )}
          {shape === 'plan' && <span className="skeleton-block plan" />}
        </div>
      )}
    </div>
  );
}
