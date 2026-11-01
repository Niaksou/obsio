import type { Contractor, ContractorInput } from '@obsio/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';

/** Ajout ou modification d'un intervenant (électricien prestataire, sans compte). */
export function ContractorForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Contractor;
  onSaved: (contractor: Contractor) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (input: ContractorInput) =>
      initial ? api.updateContractor(initial.id, input) : api.createContractor(input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: keys.contractors });
      onSaved(saved);
    },
  });

  return (
    <div
      className="contractor-form"
      onKeyDown={(event) => {
        // Formulaire imbriqué dans celui de l'assignation : Entrée enregistre l'intervenant.
        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
          event.preventDefault();
          (event.currentTarget.querySelector('[data-save]') as HTMLButtonElement | null)?.click();
        }
      }}
    >
      <div className="fields">
        <label>
          Nom
          <input name="name" required defaultValue={initial?.name} placeholder="Marc Volta" />
        </label>
        <label>
          Entreprise
          <input name="company" defaultValue={initial?.company ?? ''} placeholder="Volta Élec" />
        </label>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            required
            defaultValue={initial?.email}
            placeholder="marc@volta-elec.fr"
          />
        </label>
      </div>
      <MutationError error={save.error} />
      <div className="panel-actions">
        <button
          type="button"
          data-save
          disabled={save.isPending}
          onClick={(event) => {
            const root = event.currentTarget.closest('.contractor-form')!;
            const inputs = [...root.querySelectorAll('input')];
            if (!inputs.every((input) => input.reportValidity())) return;
            const data = new FormData();
            for (const input of inputs) data.set(input.name, input.value);
            save.mutate({
              name: field(data, 'name'),
              company: field(data, 'company') || null,
              email: field(data, 'email'),
            });
          }}
        >
          {initial ? 'Enregistrer' : 'Ajouter l’intervenant'}
        </button>
        {onCancel && (
          <button type="button" className="quiet" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
