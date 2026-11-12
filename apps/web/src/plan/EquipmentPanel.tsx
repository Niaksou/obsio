import {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPES,
  type Equipment,
  type EquipmentInput,
  type EquipmentType,
  type PlanPosition,
  type Zone,
} from '@obsio/shared';
import { useState, type ReactNode } from 'react';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { field } from '../components/Form.js';
import { OUTSIDE_ZONES, sortForSearch, type ZoneChoice } from './filters.js';
import { groupByZone } from './zones.js';
import type { ReserveBadge } from './PlanViewer.js';

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
  /** Réserves en cours par équipement : nombre, statut le plus urgent, retard. */
  badges?: Map<string, ReserveBadge>;
  /** Équipements retenus par la recherche ou les filtres ; null : aucun critère. */
  matching?: Set<string> | null;
  /** Recherche et filtres, affichés au-dessus de la liste. */
  filters?: ReactNode;
  /** Recherche en cours : les résultats les plus proches en tête. */
  search?: string;
  /** Zones de l'étage : la liste est regroupée par zone. */
  zones?: Zone[];
  /** Zone choisie, son en-tête remplace les groupes. */
  activeZone?: Zone | null;
  onZoneSelect?: (zone: ZoneChoice) => void;
  /** Renommer, retirer la zone choisie (admin). */
  zoneActions?: ReactNode;
  onClearQuery?: () => void;
  /** Réserves de l'équipement sélectionné. */
  renderReserves?: (equipmentId: string) => ReactNode;
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
        {props.renderReserves?.(selected.id)}
        {error && <p className="error">{error.message}</p>}
      </aside>
    );
  }

  const { matching = null, zones = [] } = props;
  const sorted = sortForSearch(equipment, props.search ?? '');
  const shown = matching ? sorted.filter((item) => matching.has(item.id)) : sorted;
  return (
    <aside className="panel" aria-label="Équipements de l'étage">
      <div className="panel-head">
        <h2>Équipements</h2>
        {sorted.length > 0 && (
          <span className="count" aria-live="polite">
            {matching ? `${shown.length} sur ${sorted.length}` : sorted.length}
          </span>
        )}
      </div>
      {sorted.length === 0 && (
        <p className="empty">
          {isAdmin
            ? 'Aucun équipement. Utilisez « Placer un équipement », puis cliquez sur le plan.'
            : 'Aucun équipement sur cet étage.'}
        </p>
      )}
      {sorted.length > 0 && props.filters}
      {sorted.length > 0 && shown.length === 0 && (
        <p className="empty">
          Aucun équipement ne correspond.{' '}
          {props.onClearQuery && (
            <button type="button" className="link" onClick={props.onClearQuery}>
              Tout afficher
            </button>
          )}
        </p>
      )}
      {props.activeZone && (
        <div className="zone-head">
          <div className="zone-head-title">
            <span className="zone-tag">{props.activeZone.name}</span>
            <button type="button" className="link" onClick={() => props.onZoneSelect?.(null)}>
              Toutes les zones
            </button>
          </div>
          {props.zoneActions}
        </div>
      )}
      {shown.length > 0 &&
        (zones.length > 0 && !props.activeZone ? (
          groupByZone(shown, zones)
            .filter((group) => group.items.length > 0 || (!matching && group.zone))
            .map((group) => (
              <section key={group.zone?.id ?? OUTSIDE_ZONES} className="zone-group">
                <button
                  type="button"
                  className="zone-group-head"
                  onClick={() => props.onZoneSelect?.(group.zone?.id ?? OUTSIDE_ZONES)}
                >
                  <span>{group.zone?.name ?? 'Hors zone'}</span>
                  <span className="count">{group.items.length}</span>
                </button>
                {group.items.length > 0 && (
                  <ul className="equipment-list">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <EquipmentRow
                          item={item}
                          badge={props.badges?.get(item.id)}
                          onSelect={() => props.onSelect(item.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
        ) : (
          <ul className="equipment-list">
            {shown.map((item) => (
              <li key={item.id}>
                <EquipmentRow
                  item={item}
                  badge={props.badges?.get(item.id)}
                  onSelect={() => props.onSelect(item.id)}
                />
              </li>
            ))}
          </ul>
        ))}
      {error && <p className="error">{error.message}</p>}
    </aside>
  );
}

/** Ligne de la liste : plaque, type, puis réserves en cours ou « Non placé ». */
export function EquipmentRow({
  item,
  badge,
  onSelect,
}: {
  item: Equipment;
  badge?: ReserveBadge;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="equipment-row" onClick={onSelect}>
      <span className="plate">{item.name}</span>
      <span className="row-meta">{EQUIPMENT_TYPE_LABELS[item.type]}</span>
      <span className="equipment-row-end">
        {!item.position && <span className="status-missing">À placer</span>}
        {badge && (
          <span
            className={`reserve-count reserve-count-${badge.status}${badge.overdue ? ' late' : ''}`}
            title={badge.overdue ? 'Dont en retard' : undefined}
          >
            {badge.count} réserve{badge.count > 1 ? 's' : ''}
          </span>
        )}
      </span>
    </button>
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
