import {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPES,
  type Equipment,
  type EquipmentInput,
  type EquipmentType,
  type PlanPosition,
} from '@obsio/shared';
import { useState } from 'react';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { field } from '../components/Form.js';

/** « presse, presse hydraulique » → ['presse', 'presse hydraulique'] */
export function parseAliases(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ];
}

function namePlaceholder(type: EquipmentType) {
  if (type === 'machine') return 'Presse 3';
  if (type === 'tgbt') return 'TGBT';
  return 'TD2';
}

interface EquipmentPanelProps {
  equipment: Equipment[];
  selected: Equipment | null;
  draft: PlanPosition | null;
  isAdmin: boolean;
  pending: boolean;
  error: Error | null;
  onSelect: (id: string | null) => void;
  onCreate: (input: EquipmentInput) => void;
  onCancelDraft: () => void;
  onUpdate: (id: string, input: Partial<EquipmentInput>) => void;
  onArchive: (id: string) => void;
  /** Passe en mode « placer » pour donner une position à cet équipement. */
  onStartPlacing: (id: string) => void;
}

export function EquipmentPanel(props: EquipmentPanelProps) {
  const { equipment, selected, draft, isAdmin, error } = props;

  if (draft && isAdmin) {
    return (
      <aside className="panel" aria-label="Nouvel équipement">
        <h2>Nouvel équipement</h2>
        <EquipmentForm
          key="draft"
          initial={null}
          pending={props.pending}
          submitLabel="Ajouter l’équipement"
          onSubmit={(input) => props.onCreate({ ...input, position: draft })}
          onCancel={props.onCancelDraft}
        />
        {error && <p className="error">{error.message}</p>}
      </aside>
    );
  }

  if (selected) {
    return (
      <aside className="panel" aria-label="Équipement sélectionné">
        <button type="button" className="back" onClick={() => props.onSelect(null)}>
          Tous les équipements
        </button>
        {isAdmin ? (
          <>
            <h2>{selected.name}</h2>
            <EquipmentForm
              key={selected.id}
              initial={selected}
              pending={props.pending}
              submitLabel="Enregistrer"
              onSubmit={(input) => props.onUpdate(selected.id, input)}
            />
            <div className="panel-actions">
              {selected.position ? (
                <button
                  type="button"
                  className="quiet"
                  disabled={props.pending}
                  onClick={() => props.onUpdate(selected.id, { position: null })}
                >
                  Retirer du plan
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => props.onStartPlacing(selected.id)}
                >
                  Placer sur le plan
                </button>
              )}
              <ConfirmButton
                label="Archiver"
                confirmLabel="Archiver l’équipement"
                disabled={props.pending}
                onConfirm={() => props.onArchive(selected.id)}
              />
            </div>
            {selected.position && (
              <p className="hint">Faites glisser le repère pour le déplacer sur le plan.</p>
            )}
          </>
        ) : (
          <EquipmentDetails equipment={selected} />
        )}
        {error && <p className="error">{error.message}</p>}
      </aside>
    );
  }

  const sorted = [...equipment].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { numeric: true }),
  );
  return (
    <aside className="panel" aria-label="Équipements de l'étage">
      <h2>Équipements</h2>
      {sorted.length === 0 && (
        <p className="empty">
          {isAdmin
            ? 'Aucun équipement. Utilisez « Placer un équipement », puis cliquez sur le plan.'
            : 'Aucun équipement sur cet étage.'}
        </p>
      )}
      {sorted.length > 0 && (
        <ul className="equipment-list">
          {sorted.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => props.onSelect(item.id)}>
                <span className="plate">{item.name}</span>
                <span className="row-meta">{EQUIPMENT_TYPE_LABELS[item.type]}</span>
                {!item.position && <span className="status status-missing">Non placé</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error.message}</p>}
    </aside>
  );
}

function EquipmentDetails({ equipment }: { equipment: Equipment }) {
  return (
    <>
      <h2>
        <span className="plate">{equipment.name}</span>
      </h2>
      <dl className="details">
        <dt>Type</dt>
        <dd>{EQUIPMENT_TYPE_LABELS[equipment.type]}</dd>
        <dt>Autres noms</dt>
        <dd>{equipment.aliases.length ? equipment.aliases.join(', ') : 'Aucun'}</dd>
        <dt>Sur le plan</dt>
        <dd>{equipment.position ? 'Placé' : 'Non placé'}</dd>
      </dl>
    </>
  );
}

function EquipmentForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Equipment | null;
  pending: boolean;
  submitLabel: string;
  onSubmit: (input: Omit<EquipmentInput, 'position'>) => void;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<EquipmentType>(initial?.type ?? 'td');

  return (
    <form
      className="panel-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          type,
          name: field(data, 'name'),
          aliases: parseAliases(field(data, 'aliases')),
        });
      }}
    >
      <label>
        Type
        <select value={type} onChange={(event) => setType(event.target.value as EquipmentType)}>
          {EQUIPMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {EQUIPMENT_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {type === 'machine' ? 'Nom de la machine' : 'Repère'}
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={initial?.name}
          placeholder={namePlaceholder(type)}
          autoFocus={!initial}
        />
      </label>
      <label>
        Autres noms
        <input
          name="aliases"
          defaultValue={initial?.aliases.join(', ')}
          placeholder="Tableau atelier, TD atelier"
          aria-describedby="aliases-hint"
        />
      </label>
      <p className="hint" id="aliases-hint">
        Séparés par des virgules : les noms employés dans les rapports de vérification, pour y
        retrouver cet équipement.
      </p>
      <div className="panel-actions">
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="quiet" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
