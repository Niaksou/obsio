import type { Building } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { field } from '../components/Form.js';
import { ImportsSection, ReportUploadButton } from '../imports/ImportsSection.js';
import { SiteInspections } from '../inspections/SiteInspections.js';
import { MutationError } from '../components/MutationError.js';
import { keys, useIsAdmin } from '../queries.js';
import { SiteAlerts, SiteProgress } from '../reserves/SiteDashboard.js';
import { plural } from '../reserves/status.js';
import { Loading } from '../components/Loading.js';

export function SitePage() {
  const siteId = useParams().siteId!;
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const site = useQuery({ queryKey: keys.site(siteId), queryFn: () => api.site(siteId) });
  const archive = useMutation({
    mutationFn: () => api.archive('sites', siteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.sites });
      navigate('/', { replace: true });
    },
  });

  if (site.error) return <p className="error">{site.error.message}</p>;
  if (!site.data) return <Loading shape="detail" />;

  return (
    <div className="page site-page">
      <header className="site-head">
        <div className="site-head-text">
          <p className="crumbs">
            <Link to="/">Sites</Link>
          </p>
          <h1>{site.data.name}</h1>
          {site.data.address && <p className="row-meta">{site.data.address}</p>}
        </div>
        <div className="site-head-actions">
          <Link to={`/sites/${siteId}/reserves`} className="button-link secondary">
            Réserves du site
          </Link>
          {isAdmin && <ReportUploadButton siteId={siteId} />}
        </div>
      </header>

      <SiteAlerts siteId={siteId} />

      <div className="site-grid">
        <div className="site-main">
          <SiteProgress siteId={siteId} isAdmin={isAdmin} />
          <BuildingsSection siteId={siteId} isAdmin={isAdmin} />
        </div>
        <div className="site-side">
          <SiteInspections siteId={siteId} isAdmin={isAdmin} />
          <ImportsSection siteId={siteId} isAdmin={isAdmin} />
        </div>
      </div>

      {isAdmin && (
        <footer className="site-archive">
          <p className="hint">
            Un site archivé disparaît des listes ; ses réserves et ses preuves sont conservées
          </p>
          <ConfirmButton
            label="Archiver le site"
            confirmLabel="Archiver le site et ses bâtiments"
            disabled={archive.isPending}
            onConfirm={() => archive.mutate()}
          />
          <MutationError error={archive.error} />
        </footer>
      )}
    </div>
  );
}

/** Bâtiments du site, chacun avec ses étages ; ajout replié derrière un bouton. */
function BuildingsSection({ siteId, isAdmin }: { siteId: string; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  const buildings = useQuery({
    queryKey: keys.buildings(siteId),
    queryFn: () => api.buildings(siteId),
  });
  return (
    <section className="site-section" aria-labelledby="buildings-title">
      <div className="site-section-head">
        <h2 id="buildings-title">Bâtiments</h2>
        {isAdmin && !adding && (
          <button
            type="button"
            className="secondary compact"
            data-tour="add-building"
            onClick={() => setAdding(true)}
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Ajouter un bâtiment
          </button>
        )}
      </div>
      {adding && <AddBuilding siteId={siteId} onDone={() => setAdding(false)} />}
      {buildings.data?.length === 0 && !adding && (
        <p className="empty">
          {isAdmin
            ? 'Ajoutez les bâtiments du site, puis leurs étages et leurs plans.'
            : 'Aucun bâtiment pour l’instant.'}
        </p>
      )}
      {buildings.data?.map((building) => (
        <BuildingCard key={building.id} building={building} isAdmin={isAdmin} />
      ))}
    </section>
  );
}

function BuildingCard({ building, isAdmin }: { building: Building; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const floors = useQuery({
    queryKey: keys.floors(building.id),
    queryFn: () => api.floors(building.id),
  });
  const archive = useMutation({
    mutationFn: () => api.archive('buildings', building.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.buildings(building.siteId) }),
  });
  const count = floors.data?.length ?? 0;

  return (
    <article className="site-card building-card" data-tour="site-building">
      <header className="building-card-head">
        <div>
          <h3>{building.name}</h3>
          {floors.data && (
            <p className="hint">{count === 0 ? 'Aucun étage' : plural(count, 'étage')}</p>
          )}
        </div>
        <div className="building-card-actions">
          {count > 0 && (
            <Link to={`/batiments/${building.id}/3d`} className="quiet-link">
              <Box size={16} strokeWidth={1.5} aria-hidden />
              Vue 3D
            </Link>
          )}
          {isAdmin && (
            <ConfirmButton
              label="Archiver"
              confirmLabel="Archiver le bâtiment"
              disabled={archive.isPending}
              onConfirm={() => archive.mutate()}
            />
          )}
        </div>
      </header>
      <MutationError error={archive.error} />
      {count > 0 && (
        <ul className="floor-rows">
          {floors.data!.map((floor) => (
            <li key={floor.id}>
              <Link to={`/etages/${floor.id}`} className="floor-row">
                <span className="floor-level">{floorLevel(floor.level)}</span>
                <span className="row-title">{floor.name}</span>
                <span className={floor.plan ? 'floor-plan' : 'floor-plan missing'}>
                  {floor.plan ? 'Plan déposé' : 'Pas de plan'}
                </span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="floor-chevron" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin &&
        (adding ? (
          <AddFloor buildingId={building.id} onDone={() => setAdding(false)} />
        ) : (
          <button type="button" className="quiet compact add-floor" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            Ajouter un étage
          </button>
        ))}
    </article>
  );
}

/** Niveau en repère court : « RDC », « R+2 », « R-1 ». */
function floorLevel(level: number) {
  if (level === 0) return 'RDC';
  return level > 0 ? `R+${level}` : `R${level}`;
}

function AddBuilding({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (name: string) => api.createBuilding(siteId, { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.buildings(siteId) });
      onDone();
    },
  });
  return (
    <form
      className="site-card add-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        create.mutate(field(new FormData(form), 'name'), { onSuccess: () => form.reset() });
      }}
    >
      <div className="fields">
        <label>
          Nom du bâtiment
          <input name="name" required autoFocus placeholder="Atelier principal" />
        </label>
        <button type="submit" disabled={create.isPending}>
          Ajouter
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Annuler
        </button>
      </div>
      <MutationError error={create.error} />
    </form>
  );
}

function AddFloor({ buildingId, onDone }: { buildingId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (input: { name: string; level: number }) => api.createFloor(buildingId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.floors(buildingId) });
      onDone();
    },
  });
  return (
    <form
      className="add-form add-floor-form"
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
          <input name="name" required autoFocus placeholder="Rez-de-chaussée" />
        </label>
        <label className="narrow">
          Niveau
          <input name="level" type="number" min={-20} max={200} defaultValue={0} />
        </label>
        <button type="submit" disabled={create.isPending}>
          Ajouter
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Annuler
        </button>
      </div>
      <MutationError error={create.error} />
    </form>
  );
}
