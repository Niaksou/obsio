import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { PasskeySuggestion } from '../components/Passkeys.js';
import { keys, useIsManager } from '../queries.js';
import { plural } from '../reserves/status.js';
import { Loading } from '../components/Loading.js';

export function SitesPage() {
  const isManager = useIsManager();
  const sites = useQuery({ queryKey: keys.sites, queryFn: api.sites });
  const mine = useQuery({ queryKey: keys.myReserves, queryFn: api.myReserves });
  const toFix = mine.data?.filter((r) => r.status !== 'corrigee') ?? [];
  const overdue = toFix.filter((r) => r.overdue).length;

  return (
    <div className="page">
      <PasskeySuggestion />
      {toFix.length > 0 && (
        <Link to="/mes-reserves" className="my-reserves-banner">
          <strong>
            {plural(toFix.length, 'réserve')} à corriger vous{' '}
            {toFix.length > 1 ? 'sont confiées' : 'est confiée'}
          </strong>
          {overdue > 0 && <span className="late"> dont {overdue} en retard</span>}
          <span aria-hidden="true"> →</span>
        </Link>
      )}
      <h1>Sites</h1>
      {sites.isPending && <Loading inline />}
      {sites.error && <p className="error">{sites.error.message}</p>}
      {sites.data?.length === 0 && (
        <p className="empty">
          {isManager
            ? 'Ajoutez votre premier site : l’établissement dont les installations sont vérifiées.'
            : 'Aucun site pour l’instant. L’administrateur de votre organisation les ajoute.'}
        </p>
      )}
      {sites.data && sites.data.length > 0 && (
        <ul className="rows">
          {sites.data.map((site) => (
            <li key={site.id}>
              <Link to={`/sites/${site.id}`} className="row-link" data-tour="site-row">
                <span className="row-title">{site.name}</span>
                {site.address && <span className="row-meta">{site.address}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isManager && <AddSite />}
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
      data-tour="add-site"
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
