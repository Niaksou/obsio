import type { Equipment, EquipmentInput, FloorDetail, PlanPosition } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { EquipmentPanel } from '../plan/EquipmentPanel.js';
import { PlanUpload } from '../plan/PlanUpload.js';
import { PlanViewer, type PlanViewerHandle } from '../plan/PlanViewer.js';
import { keys, useIsAdmin } from '../queries.js';

/** Les liens signés du plan valent 15 minutes : on ne les renouvelle pas plus souvent. */
const FLOOR_STALE_TIME = 10 * 60 * 1000;

type Placing = { kind: 'new' } | { kind: 'existing'; id: string } | null;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing>(null);
  const [draft, setDraft] = useState<PlanPosition | null>(null);
  const [replacingPlan, setReplacingPlan] = useState(false);
  const viewer = useRef<PlanViewerHandle | null>(null);
  const setViewer = useCallback((handle: PlanViewerHandle) => {
    viewer.current = handle;
  }, []);

  const items = equipment.data ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;

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
    if (draft) return;
    setSelectedId(id);
  }

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
        <div className="tools">
          {floor.plan && !showUpload && (
            <button type="button" className="quiet" onClick={() => viewer.current?.fit()}>
              Tout afficher
            </button>
          )}
          {floor.plan && !showUpload && (
            <>
              {isAdmin && (
                <button
                  type="button"
                  className={placing ? 'secondary active' : 'secondary'}
                  aria-pressed={placing?.kind === 'new'}
                  disabled={!!draft}
                  onClick={() => setPlacing(placing ? null : { kind: 'new' })}
                >
                  {placing ? 'Annuler le placement' : 'Placer un équipement'}
                </button>
              )}
              {isAdmin && (
                <button type="button" className="quiet" onClick={() => setReplacingPlan(true)}>
                  Remplacer le plan
                </button>
              )}
              {floor.plan.sourceUrl && (
                <a
                  className="quiet-link"
                  href={floor.plan.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF d’origine
                </a>
              )}
            </>
          )}
          {isAdmin && (
            <ConfirmButton
              label="Archiver l’étage"
              confirmLabel="Archiver l’étage et ses équipements"
              disabled={archiveFloor.isPending}
              onConfirm={() => archiveFloor.mutate()}
            />
          )}
        </div>
      </div>

      <div className="plan-area">
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
            selectedId={selectedId}
            draft={draft}
            editable={isAdmin}
            placing={!!placing}
            onSelect={select}
            onPlace={place}
            onMove={(id, position) => update.mutate({ id, input: { position } })}
            handleRef={setViewer}
          />
        )}
        {placing && (
          <p className="placing-hint" role="status">
            Cliquez sur le plan à l’emplacement de l’équipement.
          </p>
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
          onSelect={select}
          onCreate={(input) => create.mutate(input)}
          onCancelDraft={() => {
            setDraft(null);
            create.reset();
          }}
          onUpdate={(id, input) => update.mutate({ id, input })}
          onArchive={(id) => archive.mutate(id)}
          onStartPlacing={(id) => setPlacing({ kind: 'existing', id })}
        />
      )}
      {archiveFloor.error && <p className="error">{archiveFloor.error.message}</p>}
    </div>
  );
}

/** Cartouche de plan technique, en bas à droite : où se trouve-t-on. */
function TitleBlock({ floor }: { floor: FloorDetail }) {
  return (
    <dl className="title-block" aria-label="Cartouche">
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
    </dl>
  );
}
