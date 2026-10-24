import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { keys, useIsAdmin } from '../queries.js';

export function SitesPage() {
  const isAdmin = useIsAdmin();
  const sites = useQuery({ queryKey: keys.sites, queryFn: api.sites });

  return (
    <div className="page">
      <h1>Sites</h1>
      {sites.isPending && <p className="loading">Chargement…</p>}
      {sites.error && <p className="error">{sites.error.message}</p>}
      {sites.data?.length === 0 && (
        <p className="empty">
          {isAdmin
            ? 'Ajoutez votre premier site : l’établissement dont les installations sont vérifiées.'
            : 'Aucun site pour l’instant. L’administrateur de votre organisation les ajoute.'}
        </p>
      )}
      {sites.data && sites.data.length > 0 && (
        <ul className="rows">
          {sites.data.map((site) => (
            <li key={site.id}>
              <Link to={`/sites/${site.id}`} className="row-link">
                <span className="row-title">{site.name}</span>
                {site.address && <span className="row-meta">{site.address}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && <AddSite />}
    </div>
  );
}

function AddSite() {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: api.createSite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.sites }),
  });

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        create.mutate(
          { name: field(data, 'name'), address: field(data, 'address') || null },
          { onSuccess: () => form.reset() },
        );
      }}
    >
      <h2>Ajouter un site</h2>
      <div className="fields">
        <label>
          Nom
          <input name="name" required placeholder="Usine de Lyon" />
        </label>
        <label>
          Adresse
          <input name="address" placeholder="Facultative" />
        </label>
        <button type="submit" disabled={create.isPending}>
          Ajouter le site
        </button>
      </div>
      <MutationError error={create.error} />
    </form>
  );
}
