import { ASSIGNMENT_DEFAULT_DAYS, type Contractor } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';
import { ContractorForm } from './ContractorForm.js';
import { plural } from './status.js';

function inDays(days: number) {
  const date = new Date(Date.now() + days * 24 * 3600 * 1000);
  return date.toLocaleDateString('sv-SE');
}

/** Assignation des réserves choisies : intervenant, échéance, message ; le lien est montré une fois. */
export function AssignPanel({
  siteId,
  reserveIds,
  onClose,
}: {
  siteId: string;
  reserveIds: string[];
  onClose: (done: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const contractors = useQuery({ queryKey: keys.contractors, queryFn: api.contractors });
  const [contractorId, setContractorId] = useState('');
  const [adding, setAdding] = useState(false);
  const [dueDate, setDueDate] = useState(inDays(ASSIGNMENT_DEFAULT_DAYS));
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const assign = useMutation({
    mutationFn: () =>
      api.createAssignment({
        contractorId,
        reserveIds,
        dueDate: dueDate || null,
        message: message.trim() || null,
        validityDays: ASSIGNMENT_DEFAULT_DAYS,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.siteReserves(siteId) });
      await Promise.all(
        reserveIds.map((id) => queryClient.invalidateQueries({ queryKey: keys.reserve(id) })),
      );
    },
  });

  const list = contractors.data ?? [];
  const chosen = list.find((c) => c.id === contractorId);

  if (assign.data) {
    const link = assign.data.link;
    return (
      <div className="assign-panel" role="status">
        <h2>Lien envoyé à {assign.data.contractor.name}</h2>
        <p>
          {chosen?.email ? `Un e-mail est parti à ${chosen.email}. ` : ''}
          Vous pouvez aussi transmettre ce lien vous-même : il ne sera plus affiché ensuite.
        </p>
        <div className="link-box">
          <input
            readOnly
            value={link}
            aria-label="Lien de l’intervenant"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copié' : 'Copier le lien'}
          </button>
        </div>
        <button type="button" onClick={() => onClose(true)}>
          Terminer
        </button>
      </div>
    );
  }

  return (
    <form
      className="assign-panel"
      onSubmit={(event) => {
        event.preventDefault();
        assign.mutate();
      }}
    >
      <h2>Assigner {plural(reserveIds.length, 'réserve')}</h2>
      {adding ? (
        <ContractorForm
          onCancel={() => setAdding(false)}
          onSaved={(created: Contractor) => {
            setContractorId(created.id);
            setAdding(false);
          }}
        />
      ) : (
        <div className="fields">
          <label>
            Intervenant
            <select
              required
              value={contractorId}
              onChange={(event) => setContractorId(event.target.value)}
            >
              <option value="" disabled>
                {list.length ? 'Choisir' : 'Aucun intervenant enregistré'}
              </option>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? `, ${c.company}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" onClick={() => setAdding(true)}>
            Nouvel intervenant
          </button>
        </div>
      )}
      <div className="fields">
        <label className="date">
          Échéance
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </div>
      <label>
        Message pour l’intervenant
        <textarea
          rows={2}
          maxLength={2000}
          value={message}
          placeholder="Accès par le quai B, demander le badge à l’accueil."
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <p className="hint">
        L’intervenant reçoit un lien valable {ASSIGNMENT_DEFAULT_DAYS} jours, sans compte à créer.
      </p>
      <MutationError error={assign.error} />
      <div className="panel-actions">
        <button type="submit" disabled={!contractorId || adding || assign.isPending}>
          Assigner et envoyer le lien
        </button>
        <button type="button" className="quiet" onClick={() => onClose(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
