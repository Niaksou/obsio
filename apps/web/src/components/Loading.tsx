/**
 * État de chargement : fine barre animée en haut de l'écran et silhouette grise du contenu.
 * Rien ne s'affiche pendant les 200 premières millisecondes (pas de clignotement quand la
 * réponse est rapide) ; les lecteurs d'écran entendent « Chargement » tout de suite.
 *
 * `inline` : quelques lignes en silhouette, sans titre, dans une page déjà affichée.
 * `page` : marges des pages en plein écran (plan, rapport, vue 3D).
 */
export function Loading({ inline = false, page = false }: { inline?: boolean; page?: boolean }) {
  const className = ['loading-state', inline && 'inline', page && 'page-message']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} role="status">
      <span className="visually-hidden">Chargement</span>
      <span className="loading-bar" aria-hidden />
      <div className="loading-skeleton" aria-hidden>
        {!inline && <span className="skeleton-title" />}
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
        <span className="skeleton-line" />
      </div>
    </div>
  );
}
