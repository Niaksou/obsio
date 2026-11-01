import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api.js';
import { keys, useIsAdmin } from '../queries.js';
import { ContractorForm } from '../reserves/ContractorForm.js';

/** Électriciens prestataires de l'organisation, à qui l'on assigne des réserves par lien. */
export function ContractorsPage() {
  const isAdmin = useIsAdmin();
  const contractors = useQuery({ queryKey: keys.contractors, queryFn: api.contractors });
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="page">
      <div className="title-row">
        <h1>Intervenants</h1>
      </div>
      <p className="hint">
        Les intervenants n’ont pas de compte : ils reçoivent par e-mail un lien vers les réserves
        qui leur sont assignées, et y déposent leurs photos.
      </p>
      {contractors.error && <p className="error">{contractors.error.message}</p>}
      {contractors.data?.length === 0 && (
        <p className="empty">
          {isAdmin
            ? 'Ajoutez les électriciens qui interviennent sur vos sites.'
            : 'Aucun intervenant enregistré.'}
        </p>
      )}
      {contractors.data && contractors.data.length > 0 && (
        <ul className="rows">
          {contractors.data.map((c) => (
            <li key={c.id} className="contractor-row">
              {editing === c.id ? (
                <ContractorForm
                  initial={c}
                  onSaved={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <span className="row-title">{c.name}</span>
                  <span className="row-meta">
                    {c.company ? `${c.company}, ` : ''}
                    {c.email}
                  </span>
                  {isAdmin && (
                    <button type="button" className="quiet" onClick={() => setEditing(c.id)}>
                      Modifier
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <div className="inline-form">
          <h2>Ajouter un intervenant</h2>
          {adding ? (
            <ContractorForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" className="secondary" onClick={() => setAdding(true)}>
              Nouvel intervenant
            </button>
          )}
        </div>
      )}
    </div>
  );
}
