import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api.js';
import { authClient } from '../auth-client.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';
import { plural } from './status.js';

/**
 * Réserves choisies confiées à un ou plusieurs collaborateurs (membres de l'organisation),
 * prévenus par e-mail. Ceux qui en sont déjà chargés ne sont pas proposés.
 */
export function CollaboratorPanel({
  siteId,
  reserveIds,
  exclude = [],
  onClose,
}: {
  siteId: string;
  reserveIds: string[];
  exclude?: string[];
  onClose: (done: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: organisation } = authClient.useActiveOrganization();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  const [message, setMessage] = useState('');

  const assign = useMutation({
    mutationFn: () =>
      api.assignCollaborators({
        userIds: [...chosen],
        reserveIds,
        dueDate: dueDate || null,
        message: message.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.siteReserves(siteId) });
      await queryClient.invalidateQueries({ queryKey: keys.myReserves });
      await Promise.all(
        reserveIds.map((id) => queryClient.invalidateQueries({ queryKey: keys.reserve(id) })),
      );
      onClose(true);
    },
  });

  const people = (organisation?.members ?? [])
    .filter((m) => !exclude.includes(m.userId))
    .sort((a, b) => a.user.name.localeCompare(b.user.name, 'fr'));

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      className="assign-panel"
      onSubmit={(event) => {
        event.preventDefault();
        assign.mutate();
      }}
    >
      <h2>Confier {plural(reserveIds.length, 'réserve')}</h2>
      {people.length === 0 ? (
        <p className="empty">Aucun autre collaborateur. Invitez-en depuis la page Organisation.</p>
      ) : (
        <fieldset className="collaborator-list">
          <legend>Collaborateurs</legend>
          {people.map((m) => (
            <label key={m.userId} className="check">
              <input
                type="checkbox"
                checked={chosen.has(m.userId)}
                onChange={() => toggle(m.userId)}
              />
              {m.user.name}
              <small>{m.user.email}</small>
            </label>
          ))}
        </fieldset>
      )}
      <div className="fields">
        <label className="date">
          Échéance (facultative)
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
      </div>
      <label>
        Message (facultatif)
        <textarea
          rows={2}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <MutationError error={assign.error} />
      <div className="panel-actions">
        <button type="submit" disabled={chosen.size === 0 || assign.isPending}>
          Confier et prévenir par e-mail
        </button>
        <button type="button" className="quiet" onClick={() => onClose(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
