import type { Building } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { keys, useIsAdmin } from '../queries.js';

export function SitePage() {
  const siteId = useParams().siteId!;
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: keys.site(siteId), queryFn: () => api.site(siteId) });
  const buildings = useQuery({
    queryKey: keys.buildings(siteId),
    queryFn: () => api.buildings(siteId),
  });
  const archive = useMutation({
    mutationFn: () => api.archive('sites', siteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.sites });
      navigate('/', { replace: true });
    },
  });

  if (site.error) return <p className="error">{site.error.message}</p>;
  if (!site.data) return <p className="loading">Chargement…</p>;

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/">Sites</Link>
      </p>
      <div className="title-row">
        <div>
          <h1>{site.data.name}</h1>
          {site.data.address && <p className="row-meta">{site.data.address}</p>}
        </div>
        {isAdmin && (
          <ConfirmButton
            label="Archiver le site"
            confirmLabel="Archiver le site et ses bâtiments"
            disabled={archive.isPending}
            onConfirm={() => archive.mutate()}
          />
        )}
      </div>
      <MutationError error={archive.error} />

      {buildings.data?.length === 0 && (
        <p className="empty">
          {isAdmin
            ? 'Ajoutez les bâtiments du site, puis leurs étages et leurs plans.'
            : 'Aucun bâtiment pour l’instant.'}
        </p>
      )}
      {buildings.data?.map((building) => (
        <BuildingSection key={building.id} building={building} isAdmin={isAdmin} />
      ))}
      {isAdmin && <AddBuilding siteId={siteId} />}
    </div>
  );
}

function BuildingSection({ building, isAdmin }: { building: Building; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const floors = useQuery({
    queryKey: keys.floors(building.id),
    queryFn: () => api.floors(building.id),
  });
  const archive = useMutation({
    mutationFn: () => api.archive('buildings', building.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.buildings(building.siteId) }),
  });

  return (
    <section className="building">
      <div className="title-row">
        <h2>{building.name}</h2>
        {isAdmin && (
          <ConfirmButton
            label="Archiver"
            confirmLabel="Archiver le bâtiment"
            disabled={archive.isPending}
            onConfirm={() => archive.mutate()}
          />
        )}
      </div>
      <MutationError error={archive.error} />
      {floors.data?.length === 0 && <p className="empty">Aucun étage.</p>}
      {floors.data && floors.data.length > 0 && (
        <ul className="rows">
          {floors.data.map((floor) => (
            <li key={floor.id}>
              <Link to={`/etages/${floor.id}`} className="row-link">
                <span className="row-title">{floor.name}</span>
                <span className="row-meta">Niveau {floor.level}</span>
                <span className={floor.plan ? 'status' : 'status status-missing'}>
                  {floor.plan ? 'Plan déposé' : 'Pas de plan'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && <AddFloor buildingId={building.id} />}
    </section>
  );
}

function AddBuilding({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (name: string) => api.createBuilding(siteId, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.buildings(siteId) }),
  });
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        create.mutate(field(new FormData(form), 'name'), { onSuccess: () => form.reset() });
      }}
    >
      <h2>Ajouter un bâtiment</h2>
      <div className="fields">
        <label>
          Nom
          <input name="name" required placeholder="Atelier principal" />
        </label>
        <button type="submit" disabled={create.isPending}>
          Ajouter le bâtiment
        </button>
      </div>
      <MutationError error={create.error} />
    </form>
  );
}

function AddFloor({ buildingId }: { buildingId: string }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (input: { name: string; level: number }) => api.createFloor(buildingId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.floors(buildingId) }),
  });
  return (
    <form
      className="inline-form compact"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        create.mutate(
          { name: field(data, 'name'), level: Number(field(data, 'level') || 0) },
          { onSuccess: () => form.reset() },
        );
      }}
    >
      <div className="fields">
        <label>
          Nouvel étage
          <input name="name" required placeholder="Rez-de-chaussée" />
        </label>
        <label className="narrow">
          Niveau
          <input name="level" type="number" min={-20} max={200} defaultValue={0} />
        </label>
        <button type="submit" disabled={create.isPending}>
          Ajouter l’étage
        </button>
      </div>
      <MutationError error={create.error} />
    </form>
  );
}
