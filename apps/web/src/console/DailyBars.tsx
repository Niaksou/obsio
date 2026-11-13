import { useState, type ReactNode } from 'react';

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
export const formatDay = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`));

/** Barres fines d'une seule série, un point par jour, détail au survol. */
export function DailyBars<D extends { day: string }>({
  days,
  value,
  format,
  label,
  empty,
  tooltip,
}: {
  days: D[];
  value: (day: D) => number;
  format: (value: number) => string;
  /** Ce que mesure la série, pour les lecteurs d'écran (« Coût estimé par jour »). */
  label: string;
  empty: string;
  tooltip: (day: D) => ReactNode;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...days.map(value));
  if (max === 0) return <p className="empty">{empty}</p>;
  // Repère en unités du graphique : une colonne de 10 par jour, 100 de haut ; les textes sont
  // en HTML pour garder leur taille quelle que soit la largeur.
  const slot = 10;
  const width = days.length * slot;
  const height = 100;
  const active = hovered === null ? null : days[hovered]!;
  const labelled = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <figure className="usage-chart">
      <div className="usage-chart-plot">
        <span className="usage-axis usage-axis-max">{format(max)}</span>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label}, du ${formatDay(days[0]!.day)} au ${formatDay(days.at(-1)!.day)}, ${format(max)} au plus`}
          onMouseLeave={() => setHovered(null)}
        >
          <line x1={0} x2={width} y1={0.5} y2={0.5} className="usage-grid" />
          <line x1={0} x2={width} y1={height / 2} y2={height / 2} className="usage-grid" />
          {days.map((day, index) => {
            const h = Math.max((height * value(day)) / max, value(day) > 0 ? 1.5 : 0);
            return (
              <g key={day.day} onMouseEnter={() => setHovered(index)}>
                {/* Zone de survol sur toute la hauteur, plus large que la barre. */}
                <rect x={index * slot} y={0} width={slot} height={height} fill="transparent" />
                {h > 0 && (
                  <rect
                    className={hovered === index ? 'usage-bar hover' : 'usage-bar'}
                    x={index * slot + slot * 0.2}
                    y={height - h}
                    width={slot * 0.6}
                    height={h}
                  />
                )}
              </g>
            );
          })}
          <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className="usage-baseline" />
        </svg>
        {active && (
          <div
            className="usage-tooltip"
            style={{
              left: `${((hovered! + 0.5) / days.length) * 100}%`,
              transform: `translateX(${hovered! > days.length / 2 ? 'calc(-100% - 8px)' : '8px'})`,
            }}
          >
            <strong>{formatDay(active.day)}</strong>
            {tooltip(active)}
          </div>
        )}
      </div>
      <div className="usage-dates">
        {labelled.map((index) => (
          <span key={index} className="usage-axis">
            {formatDay(days[index]!.day)}
          </span>
        ))}
      </div>
    </figure>
  );
}
