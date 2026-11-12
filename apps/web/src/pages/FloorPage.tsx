import type {
  Equipment,
  EquipmentInput,
  FloorDetail,
  PlanPosition,
  ReserveListItem,
} from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { MenuButton } from '../components/MenuButton.js';
import { EquipmentPanel } from '../plan/EquipmentPanel.js';
import {
  EMPTY_QUERY,
  matchingIds,
  presentTypes,
  sortForSearch,
  type PlanQuery,
} from '../plan/filters.js';
import { PlanFilters } from '../plan/PlanFilters.js';
import { PlanLegend } from '../plan/PlanLegend.js';
import { PlanUpload } from '../plan/PlanUpload.js';
import type { Point } from '../plan/geometry.js';
import { PlanViewer, type PlanViewerHandle } from '../plan/PlanViewer.js';
import { formatLength, metersPerPixel, pixelDistance } from '../plan/scale.js';
import { keys, useIsAdmin } from '../queries.js';
import { reserveBadges } from '../reserves/badges.js';
import { StatusLabel } from '../reserves/status.js';

/** Les liens signés du plan valent 15 minutes : on ne les renouvelle pas plus souvent. */
const FLOOR_STALE_TIME = 10 * 60 * 1000;

type Placing = { kind: 'new' } | { kind: 'existing'; id: string } | null;
/** Outils à deux points : calibrer l'échelle (admin) ou mesurer une distance. */
type Tool = 'calibrer' | 'mesurer' | null;

export function FloorPage() {
  const floorId = useParams().floorId!;
  const floor = useQuery({
    queryKey: keys.floor(floorId),
    queryFn: () => api.floor(floorId),
    staleTime: FLOOR_STALE_TIME,
  });

  if (floor.error) return <p className="error page-message">{floor.error.message}</p>;
  if (!floor.data) return <p className="loading page-message">Chargement…</p>;
  return <Floor floor={floor.data} />;
}

function Floor({ floor }: { floor: FloorDetail }) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const equipmentKey = keys.equipment(floor.id);
  const equipment = useQuery({ queryKey: equipmentKey, queryFn: () => api.equipment(floor.id) });
  const reserveFilters = { open: 'true', floorId: floor.id } as const;
  const reserves = useQuery({
    queryKey: keys.reserves(floor.site.id, reserveFilters),
    queryFn: () => api.reserves(floor.site.id, reserveFilters),
  });
  const badges = useMemo(() => reserveBadges(reserves.data ?? []), [reserves.data]);
  const [query, setQuery] = useState<PlanQuery>(EMPTY_QUERY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing>(null);
  const [draft, setDraft] = useState<PlanPosition | null>(null);
  const [replacingPlan, setReplacingPlan] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const viewer = useRef<PlanViewerHandle | null>(null);
  const setViewer = useCallback((handle: PlanViewerHandle) => {
    viewer.current = handle;
  }, []);

  const items = useMemo(() => equipment.data ?? [], [equipment.data]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const matching = useMemo(() => matchingIds(items, query, badges), [items, query, badges]);

  function replaceItem(updated: Equipment) {
    queryClient.setQueryData<Equipment[]>(equipmentKey, (current) =>
      current?.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  const create = useMutation({
    mutationFn: (input: EquipmentInput) => api.createEquipment(floor.id, input),
    onSuccess: (created) => {
      queryClient.setQueryData<Equipment[]>(equipmentKey, (current) => [
        ...(current ?? []),
        created,
      ]);
      setDraft(null);
      setSelectedId(created.id);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EquipmentInput> }) =>
      api.updateEquipment(id, input),
    // Le repère reste là où on l'a lâché pendant l'enregistrement ; on revient en arrière en cas d'échec.
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: equipmentKey });
      const previous = queryClient.getQueryData<Equipment[]>(equipmentKey);
      const item = previous?.find((candidate) => candidate.id === id);
      if (item) replaceItem({ ...item, ...input });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(equipmentKey, context.previous);
    },
    onSuccess: replaceItem,
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.archive('equipment', id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Equipment[]>(equipmentKey, (current) =>
        current?.filter((item) => item.id !== id),
      );
      setSelectedId(null);
    },
  });

  const archiveFloor = useMutation({
    mutationFn: () => api.archive('floors', floor.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.floors(floor.buildingId) });
      navigate(`/sites/${floor.site.id}`, { replace: true });
    },
  });

  function place(position: PlanPosition) {
    if (placing?.kind === 'existing') {
      update.mutate({ id: placing.id, input: { position } });
      setSelectedId(placing.id);
    } else {
      setSelectedId(null);
      setDraft(position);
    }
    setPlacing(null);
  }

  function select(id: string | null) {
    if (draft || tool) return;
    setSelectedId(id);
  }

  /** Choix dans la liste : le plan se recentre sur le repère. */
  function selectAndFocus(id: string | null) {
    select(id);
    const position = items.find((item) => item.id === id)?.position;
    if (position && !draft && !tool) viewer.current?.focus(position);
  }

  function goToFirstMatch() {
    const first = sortForSearch(
      items.filter((item) => !matching || matching.has(item.id)),
      query.search,
    )[0];
    if (first) selectAndFocus(first.id);
  }

  const saveScale = useMutation({
    mutationFn: (scale: number | null) => api.setPlanScale(floor.id, scale),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.floor(floor.id) });
      await queryClient.invalidateQueries({ queryKey: keys.floors(floor.buildingId) });
      switchTool(null);
    },
  });

  function switchTool(next: Tool) {
    setTool(next);
    setPoints([]);
    saveScale.reset();
    if (next) {
      setPlacing(null);
      setSelectedId(null);
    }
  }

  // Échap quitte l'outil ou le placement en cours, comme le second clic sur leur bouton.
  useEffect(() => {
    if (!tool && !placing) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setTool(null);
      setPoints([]);
      setPlacing(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, placing]);

  // Un troisième clic recommence le segment.
  function addPoint(point: Point) {
    setPoints((current) => (current.length >= 2 ? [point] : [...current, point]));
  }

  const scale = floor.plan?.scale ?? null;
  const measured =
    tool === 'mesurer' && scale && points.length === 2
      ? formatLength(pixelDistance(points[0]!, points[1]!) * scale)
      : null;

  const mutationError = create.error ?? update.error ?? archive.error;
  const showUpload = isAdmin && (!floor.plan || replacingPlan);

  return (
    <div className="floor">
      <div className="toolbar">
        <p className="crumbs">
          <Link to="/">Sites</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/sites/${floor.site.id}`}>{floor.site.name}</Link>
          <span aria-hidden="true">/</span>
          <span>{floor.building.name}</span>
        </p>
        <h1>{floor.name}</h1>
        <div className="tools" data-tour="plan-tools">
          {floor.plan && !showUpload && (
            <>
              {isAdmin && (
                <button
                  type="button"
                  className={placing ? 'secondary active' : 'secondary'}
                  aria-pressed={placing?.kind === 'new'}
                  aria-label="Placer un équipement"
                  disabled={!!draft}
                  onClick={() => {
                    switchTool(null);
                    setPlacing(placing ? null : { kind: 'new' });
                  }}
                >
                  <span className="long-label">Placer un équipement</span>
                  <span className="short-label">Placer</span>
                </button>
              )}
              {scale && (
                <button
                  type="button"
                  className={tool === 'mesurer' ? 'secondary active' : 'secondary'}
                  aria-pressed={tool === 'mesurer'}
                  onClick={() => switchTool(tool === 'mesurer' ? null : 'mesurer')}
                >
                  Mesurer
                </button>
              )}
              {tool === 'calibrer' && (
                <button
                  type="button"
                  className="secondary active"
                  aria-pressed
                  onClick={() => switchTool(null)}
                >
                  {scale ? 'Recalibrer l’échelle' : 'Calibrer l’échelle'}
                </button>
              )}
            </>
          )}
          {(isAdmin || floor.plan?.sourceUrl) && (
            <MenuButton label="Plus">
              {isAdmin && floor.plan && !showUpload && tool !== 'calibrer' && (
                <button
                  type="button"
                  className="quiet"
                  data-close-menu
                  onClick={() => switchTool('calibrer')}
                >
                  {scale ? 'Recalibrer l’échelle' : 'Calibrer l’échelle'}
                </button>
              )}
              {isAdmin && floor.plan && !showUpload && (
                <button
                  type="button"
                  className="quiet"
                  data-close-menu
                  onClick={() => setReplacingPlan(true)}
                >
                  Remplacer le plan
                </button>
              )}
              {floor.plan?.sourceUrl && (
                <a
                  className="quiet-link"
                  href={floor.plan.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-close-menu
                >
                  PDF d’origine
                </a>
              )}
              {isAdmin && (
                <ConfirmButton
                  label="Archiver l’étage"
                  confirmLabel="Archiver l’étage et ses équipements"
                  disabled={archiveFloor.isPending}
                  onConfirm={() => archiveFloor.mutate()}
                />
              )}
            </MenuButton>
          )}
        </div>
      </div>

      <div className="plan-area" data-tour="plan-area">
        {showUpload && (
          <div className="plan-empty">
            <h2>{replacingPlan ? 'Remplacer le plan' : 'Plan de l’étage'}</h2>
            <PlanUpload
              floorId={floor.id}
              buildingId={floor.buildingId}
              replacing={replacingPlan}
              onDone={() => setReplacingPlan(false)}
            />
            {replacingPlan && (
              <button type="button" className="quiet" onClick={() => setReplacingPlan(false)}>
                Garder le plan actuel
              </button>
            )}
          </div>
        )}
        {!isAdmin && !floor.plan && (
          <div className="plan-empty">
            <h2>Pas encore de plan</h2>
            <p>L’administrateur de votre organisation dépose les plans des étages.</p>
          </div>
        )}
        {floor.plan && !showUpload && (
          <PlanViewer
            imageUrl={floor.plan.imageUrl}
            plan={floor.plan}
            equipment={items}
            badges={badges}
            selectedId={selectedId}
            draft={draft}
            editable={isAdmin}
            placing={!!placing}
            measuring={tool !== null}
            segment={{ points, label: measured }}
            onMeasurePoint={addPoint}
            // Pendant un tracé, la cote s'affiche sur le segment : la barre gênerait.
            metersPerPixel={tool ? null : scale}
            matching={matching}
            onSelect={select}
            onPlace={place}
            onMove={(id, position) => update.mutate({ id, input: { position } })}
            handleRef={setViewer}
          />
        )}
        {placing && (
          <p className="placing-hint" role="status">
            Cliquez sur le plan à l’emplacement de l’équipement.
            <span className="keyboard-hint"> Échap pour annuler.</span>
          </p>
        )}
        {tool === 'mesurer' && (
          <p className="placing-hint" role="status">
            {measured
              ? `Distance : ${measured}. Cliquez ailleurs pour une nouvelle mesure.`
              : 'Cliquez les deux extrémités de la distance à mesurer.'}
            <span className="keyboard-hint"> Échap pour terminer.</span>
          </p>
        )}
        {tool === 'calibrer' && points.length < 2 && (
          <p className="placing-hint" role="status">
            Cliquez les deux extrémités d’une longueur connue : une cote du plan, une porte, un mur.
            <span className="keyboard-hint"> Échap pour annuler.</span>
          </p>
        )}
        {tool === 'calibrer' && points.length === 2 && (
          <CalibrationForm
            pending={saveScale.isPending}
            error={saveScale.error}
            onSubmit={(meters) => {
              const value = metersPerPixel(points[0]!, points[1]!, meters);
              if (value) saveScale.mutate(value);
            }}
            onRestart={() => setPoints([])}
          />
        )}
        {floor.plan && !showUpload && badges.size > 0 && !tool && !placing && (
          <PlanLegend badges={badges} />
        )}
        <TitleBlock floor={floor} />
      </div>

      {floor.plan && !showUpload && (
        <EquipmentPanel
          equipment={items}
          selected={selected}
          draft={draft}
          isAdmin={isAdmin}
          pending={create.isPending || update.isPending || archive.isPending}
          error={mutationError}
          onSelect={selectAndFocus}
          onCreate={(input) => create.mutate(input)}
          onCancelDraft={() => {
            setDraft(null);
            create.reset();
          }}
          onUpdate={(id, input) => update.mutate({ id, input })}
          onArchive={(id) => archive.mutate(id)}
          onStartPlacing={(id) => setPlacing({ kind: 'existing', id })}
          badges={badges}
          matching={matching}
          search={query.search}
          onClearQuery={() => setQuery(EMPTY_QUERY)}
          filters={
            <PlanFilters
              query={query}
              types={presentTypes(items)}
              onChange={setQuery}
              onSubmitSearch={goToFirstMatch}
            />
          }
          renderReserves={(id) => (
            <EquipmentReserves
              reserves={(reserves.data ?? []).filter((r) => r.equipment?.id === id)}
            />
          )}
        />
      )}
      {archiveFloor.error && <p className="error">{archiveFloor.error.message}</p>}
    </div>
  );
}

function EquipmentReserves({ reserves }: { reserves: ReserveListItem[] }) {
  return (
    <section className="equipment-reserves">
      <h3>Réserves en cours</h3>
      {reserves.length === 0 && <p className="empty">Aucune réserve en cours.</p>}
      <ul>
        {reserves.map((item) => (
          <li key={item.id}>
            <Link to={`/reserves/${item.id}`}>
              <span className="reserve-text">{item.description}</span>
              <StatusLabel status={item.status} overdue={item.overdue} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cartouche de plan technique, en bas à droite : où se trouve-t-on. */
function TitleBlock({ floor }: { floor: FloorDetail }) {
  return (
    <dl className="title-block" aria-label="Cartouche" data-tour="title-block">
      <div className="tb-site">
        <dt>Site</dt>
        <dd>{floor.site.name}</dd>
      </div>
      <div className="tb-building">
        <dt>Bâtiment</dt>
        <dd>{floor.building.name}</dd>
      </div>
      <div className="tb-floor">
        <dt>Étage</dt>
        <dd>{floor.name}</dd>
      </div>
      <div className="tb-level">
        <dt>Niveau</dt>
        <dd>{floor.level}</dd>
      </div>
      {floor.plan && (
        <div className="tb-scale">
          <dt>Échelle</dt>
          <dd>{floor.plan.scale ? 'Calibrée' : 'Non calibrée'}</dd>
        </div>
      )}
    </dl>
  );
}

/** Longueur réelle du segment tracé, pour en déduire l'échelle du plan. */
function CalibrationForm({
  pending,
  error,
  onSubmit,
  onRestart,
}: {
  pending: boolean;
  error: Error | null;
  onSubmit: (meters: number) => void;
  onRestart: () => void;
}) {
  return (
    <form
      className="calibration-form"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('meters');
        const meters = Number(String(value).replace(',', '.'));
        if (meters > 0) onSubmit(meters);
      }}
    >
      <label>
        Longueur réelle du segment
        <span className="with-unit">
          <input
            name="meters"
            inputMode="decimal"
            required
            autoFocus
            pattern="[0-9]+([,.][0-9]+)?"
            placeholder="4,50"
          />
          m
        </span>
      </label>
      <div className="actions">
        <button type="submit" disabled={pending}>
          Enregistrer l’échelle
        </button>
        <button type="button" className="secondary" onClick={onRestart}>
          Retracer
        </button>
      </div>
      {error && <p className="error">{error.message}</p>}
    </form>
  );
}
