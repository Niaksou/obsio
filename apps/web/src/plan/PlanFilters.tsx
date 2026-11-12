import { EQUIPMENT_TYPE_LABELS, type EquipmentType } from '@obsio/shared';
import { Search, X } from 'lucide-react';
import { PLAN_FILTERS, type PlanFilter, type PlanQuery } from './filters.js';

/** Recherche, filtre par état des réserves et par type, en tête de la liste des équipements. */
export function PlanFilters({
  query,
  types,
  onChange,
  onSubmitSearch,
}: {
  query: PlanQuery;
  /** Types présents sur l'étage : le choix n'apparaît qu'à partir de deux. */
  types: EquipmentType[];
  onChange: (query: PlanQuery) => void;
  /** Entrée dans la recherche : aller au premier résultat. */
  onSubmitSearch: () => void;
}) {
  return (
    <div className="plan-filters" data-tour="plan-filters">
      <div className="search-field">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          aria-label="Rechercher un équipement"
          placeholder="Repère, nom, type"
          value={query.search}
          onChange={(event) => onChange({ ...query, search: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmitSearch();
            } else if (event.key === 'Escape' && query.search) {
              event.stopPropagation();
              onChange({ ...query, search: '' });
            }
          }}
        />
        {query.search && (
          <button
            type="button"
            className="search-clear"
            aria-label="Effacer la recherche"
            onClick={() => onChange({ ...query, search: '' })}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <div className="segmented segmented-small" role="group" aria-label="Afficher">
        {(Object.keys(PLAN_FILTERS) as PlanFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={query.filter === key}
            onClick={() => onChange({ ...query, filter: key })}
          >
            {PLAN_FILTERS[key]}
          </button>
        ))}
      </div>
      {types.length > 1 && (
        <label className="inline-select">
          <span>Type</span>
          <select
            value={query.type ?? ''}
            onChange={(event) =>
              onChange({ ...query, type: (event.target.value || null) as EquipmentType | null })
            }
          >
            <option value="">Tous</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {EQUIPMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
