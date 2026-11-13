import { RESERVE_STATUS_LABELS, type Floor } from '@obsio/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { BADGE_COLORS } from '../plan/PlanViewer.js';
import { BuildingScene, readSceneColors, type SceneFloor } from '../plan3d/BuildingScene.js';
import { keys } from '../queries.js';
import { reserveBadges } from '../reserves/badges.js';
import { plural } from '../reserves/status.js';
import { Loading } from '../components/Loading.js';

const FLOOR_STALE_TIME = 10 * 60 * 1000;

/** Résultats groupés, stables tant qu'aucune requête ne change (fonction hors composant). */
function combine<T>(results: { data?: T; error: Error | null }[]) {
  return {
    data: results.every((r) => r.data) ? results.map((r) => r.data!) : null,
    error: results.find((r) => r.error)?.error ?? null,
  };
}

function webglAvailable() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

/** Vue 3D d'un bâtiment : étages empilés, équipements colorés selon leurs réserves en cours. */
export function BuildingPage3D() {
  const buildingId = useParams().buildingId!;
  const floors = useQuery({
    queryKey: keys.floors(buildingId),
    queryFn: () => api.floors(buildingId),
  });
  if (floors.error) return <p className="error page-message">{floors.error.message}</p>;
  if (!floors.data) return <Loading shape="plan" page />;
  if (floors.data.length === 0) {
    return <p className="empty page-message">Ce bâtiment n’a pas encore d’étage.</p>;
  }
  return <Building floors={floors.data} />;
}

function Building({ floors }: { floors: Floor[] }) {
  const details = useQueries({
    queries: floors.map((floor) => ({
      queryKey: keys.floor(floor.id),
      queryFn: () => api.floor(floor.id),
      staleTime: FLOOR_STALE_TIME,
    })),
    combine,
  });
  const equipment = useQueries({
    queries: floors.map((floor) => ({
      queryKey: keys.equipment(floor.id),
      queryFn: () => api.equipment(floor.id),
    })),
    combine,
  });
  const first = details.data?.[0];
  const siteId = first?.site.id;
  const reserveFilters = { open: 'true' } as const;
  const reserves = useQuery({
    queryKey: keys.reserves(siteId ?? '', reserveFilters),
    queryFn: () => api.reserves(siteId!, reserveFilters),
    enabled: Boolean(siteId),
  });
  const badges = useMemo(() => reserveBadges(reserves.data ?? []), [reserves.data]);
  const [colors] = useState(readSceneColors);
  const [spread, setSpread] = useState(2.5);
  const [focusedFloorId, setFocusedFloorId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sceneFloors = useMemo<SceneFloor[]>(() => {
    if (!details.data || !equipment.data) return [];
    const plans = details.data;
    const items = equipment.data;
    return floors.map((floor, i) => {
      const plan = plans[i]!.plan;
      return {
        id: floor.id,
        name: floor.name,
        level: floor.level,
        plan: plan
          ? { imageUrl: plan.imageUrl, width: plan.width, height: plan.height, scale: plan.scale }
          : null,
        equipment: items[i]!.flatMap((item) =>
          item.position ? [{ id: item.id, name: item.name, position: item.position }] : [],
        ),
      };
    });
  }, [floors, details.data, equipment.data]);

  const error = details.error ?? equipment.error;
  if (error) return <p className="error page-message">{error.message}</p>;
  if (!first || sceneFloors.length === 0) {
    return <Loading shape="plan" page />;
  }

  const byLevel = [...sceneFloors].sort((a, b) => b.level - a.level);
  const floorStats = (floorId: string) => {
    const items = (reserves.data ?? []).filter((r) => r.equipment?.floorId === floorId);
    return { open: items.length, overdue: items.filter((r) => r.overdue).length };
  };
  const selected = sceneFloors
    .flatMap((f) => f.equipment.map((item) => ({ ...item, floor: f })))
    .find((item) => item.id === selectedId);
  const selectedReserves = (reserves.data ?? []).filter((r) => r.equipment?.id === selectedId);

  return (
    <div className="floor building-3d">
      <div className="toolbar">
        <p className="crumbs">
          <Link to="/">Sites</Link> / <Link to={`/sites/${first.site.id}`}>{first.site.name}</Link>
        </p>
        <h1>{first.building.name}, vue 3D</h1>
        <div className="tools">
          <label className="spread">
            Écartement
            <input
              type="range"
              min={1}
              max={4}
              step={0.5}
              value={spread}
              onChange={(event) => setSpread(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
      <div className="plan-area">
        {webglAvailable() ? (
          <BuildingScene
            floors={sceneFloors}
            badges={badges}
            colors={colors}
            spread={spread}
            focusedFloorId={focusedFloorId}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <p className="plan-empty">
            Votre navigateur n’affiche pas la 3D. Les plans restent consultables étage par étage.
          </p>
        )}
      </div>
      <aside className="panel" aria-label="Étages et réserves">
        {selected ? (
          <>
            <button type="button" className="back" onClick={() => setSelectedId(null)}>
              Tous les étages
            </button>
            <h2>{selected.name}</h2>
            <p className="row-meta">{selected.floor.name}</p>
            <p>
              {selectedReserves.length > 0
                ? `${plural(selectedReserves.length, 'réserve')} en cours`
                : 'Aucune réserve en cours.'}
            </p>
            <ul>
              {selectedReserves.map((r) => (
                <li key={r.id}>
                  <Link to={`/reserves/${r.id}`}>{r.description}</Link>
                  {r.overdue && <span className="late"> (en retard)</span>}
                </li>
              ))}
            </ul>
            <Link to={`/etages/${selected.floor.id}`}>Ouvrir le plan de l’étage</Link>
          </>
        ) : (
          <>
            <h2>Étages</h2>
            <p className="hint">
              Faites pivoter avec la souris ou le doigt, zoomez à la molette ou en pinçant. Touchez
              un repère pour voir ses réserves.
            </p>
            <ul className="rows floor-list">
              {byLevel.map((floor) => {
                const stats = floorStats(floor.id);
                const focused = focusedFloorId === floor.id;
                return (
                  <li key={floor.id}>
                    <div className="floor-line">
                      <span className="row-title">{floor.name}</span>
                      <span className="row-meta">
                        {stats.open > 0
                          ? `${plural(stats.open, 'réserve')} en cours`
                          : 'Aucune réserve'}
                        {stats.overdue > 0 && (
                          <span className="late">, {stats.overdue} en retard</span>
                        )}
                      </span>
                      <span className="floor-actions">
                        <button
                          type="button"
                          className={focused ? 'secondary active' : 'secondary'}
                          aria-pressed={focused}
                          onClick={() => setFocusedFloorId(focused ? null : floor.id)}
                        >
                          Isoler
                        </button>
                        <Link to={`/etages/${floor.id}`}>Plan</Link>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <dl className="legend">
              {(Object.keys(BADGE_COLORS) as (keyof typeof BADGE_COLORS)[]).map((status) => (
                <div key={status}>
                  <dt>
                    <span className="swatch" style={{ background: colors[status] }} />
                  </dt>
                  <dd>{RESERVE_STATUS_LABELS[status]}</dd>
                </div>
              ))}
              <div>
                <dt>
                  <span className="swatch overdue-ring" />
                </dt>
                <dd>Anneau : en retard</dd>
              </div>
            </dl>
          </>
        )}
      </aside>
    </div>
  );
}
