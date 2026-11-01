import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type ReserveFilters,
  type ReserveListItem,
} from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { keys, useIsAdmin } from '../queries.js';
import { AssignPanel } from '../reserves/AssignPanel.js';
import { DossierExport } from '../reserves/DossierExport.js';
import { equipmentLabel, formatDay, plural, StatusLabel } from '../reserves/status.js';

const VIEWS = {
  en_cours: { label: 'En cours', filters: { open: 'true' } },
  en_retard: { label: 'En retard', filters: { overdue: 'true' } },
  a_verifier: { label: 'Corrigées, à vérifier', filters: { status: 'corrigee' } },
  levees: { label: 'Levées', filters: { status: 'levee' } },
  toutes: { label: 'Toutes', filters: {} },
} satisfies Record<string, { label: string; filters: ReserveFilters }>;
type View = keyof typeof VIEWS;

const assignable = (item: ReserveListItem) =>
  item.status === 'ouverte' || item.status === 'assignee';

export function ReservesPage() {
  const siteId = useParams().siteId!;
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const view = (params.get('vue') ?? 'en_cours') as View;
  const floorId = params.get('etage') ?? undefined;
  const documentType = (params.get('document') ?? undefined) as DocumentType | undefined;
  const filters: ReserveFilters = {
    ...(VIEWS[view] ?? VIEWS.en_cours).filters,
    floorId,
    documentType,
  };

  const site = useQuery({ queryKey: keys.site(siteId), queryFn: () => api.site(siteId) });
  const equipment = useQuery({
    queryKey: keys.siteEquipment(siteId),
    queryFn: () => api.siteEquipment(siteId),
  });
  const reserves = useQuery({
    queryKey: keys.reserves(siteId, filters),
    queryFn: () => api.reserves(siteId, filters),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const floors = useMemo(() => {
    const byId = new Map<string, string>();
    for (const item of equipment.data ?? []) {
      byId.set(item.floorId, `${item.buildingName}, ${item.floorName}`);
    }
    return [...byId].sort((a, b) => a[1].localeCompare(b[1], 'fr', { numeric: true }));
  }, [equipment.data]);

  function setFilter(name: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = reserves.data ?? [];
  const selectable = rows.filter(assignable);

  return (
    <div className="page page-wide">
      <p className="crumbs">
        <Link to="/">Sites</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/sites/${siteId}`}>{site.data?.name ?? 'Site'}</Link>
      </p>
      <div className="title-row">
        <h1>Réserves</h1>
        {reserves.data && <p className="row-meta">{plural(rows.length, 'réserve')}</p>}
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Statut">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setFilter('vue', key === 'en_cours' ? undefined : key)}
            >
              {VIEWS[key].label}
            </button>
          ))}
        </div>
        <label>
          Étage
          <select value={floorId ?? ''} onChange={(e) => setFilter('etage', e.target.value)}>
            <option value="">Tous</option>
            {floors.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rapport
          <select
            value={documentType ?? ''}
            onChange={(e) => setFilter('document', e.target.value)}
          >
            <option value="">Tous</option>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {reserves.error && <p className="error">{reserves.error.message}</p>}
      {reserves.data && rows.length === 0 && (
        <p className="empty">
          {view === 'en_cours'
            ? 'Aucune réserve en cours sur ce site. Les réserves apparaissent ici une fois le rapport importé et validé.'
            : 'Aucune réserve ne correspond à ces filtres.'}
        </p>
      )}

      {isAdmin && selectable.length > 0 && (
        <label className="check select-all">
          <input
            type="checkbox"
            checked={selectable.every((item) => selected.has(item.id))}
            onChange={(event) =>
              setSelected(
                event.target.checked ? new Set(selectable.map((item) => item.id)) : new Set(),
              )
            }
          />
          Tout sélectionner pour assigner
        </label>
      )}
      {rows.length > 0 && (
        <ul className="rows reserve-rows">
          {rows.map((item) => (
            <li key={item.id} className={selected.has(item.id) ? 'selected' : undefined}>
              {isAdmin && (
                <input
                  type="checkbox"
                  aria-label={`Sélectionner : ${item.description}`}
                  disabled={!assignable(item)}
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
              )}
              <ReserveRow item={item} />
            </li>
          ))}
        </ul>
      )}

      <DossierExport siteId={siteId} />

      {isAdmin && selected.size > 0 && (
        <div className="selection-bar">
          {assigning ? (
            <AssignPanel
              siteId={siteId}
              reserveIds={[...selected]}
              onClose={(done) => {
                setAssigning(false);
                if (done) setSelected(new Set());
              }}
            />
          ) : (
            <>
              <p>
                {plural(selected.size, 'réserve')} sélectionnée{selected.size > 1 ? 's' : ''}
              </p>
              <button type="button" onClick={() => setAssigning(true)}>
                Assigner à un intervenant
              </button>
              <button type="button" className="quiet" onClick={() => setSelected(new Set())}>
                Désélectionner
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ReserveRow({ item }: { item: ReserveListItem }) {
  return (
    <Link to={`/reserves/${item.id}`} className="reserve-row">
      <span className="reserve-main">
        <span className="reserve-text">{item.description}</span>
        <span className="row-meta">
          {item.equipment ? <span className="plate plate-small">{item.equipment.name}</span> : null}{' '}
          {item.equipment
            ? `${item.equipment.buildingName}, ${item.equipment.floorName}`
            : equipmentLabel(item)}
          {item.sources.length > 0 &&
            ` ; ${item.sources
              .map((s) => `${DOCUMENT_TYPE_LABELS[s.documentType]} n° ${s.reference}`)
              .join(', ')}`}
          {item.reconduite && ' ; reconduite'}
        </span>
      </span>
      <span className="reserve-side">
        <StatusLabel status={item.status} overdue={item.overdue} />
        <span className="row-meta">
          {item.assignedTo && item.status !== 'levee' ? `${item.assignedTo.name}` : ''}
          {item.assignedTo && item.dueDate && item.status !== 'levee' ? ', ' : ''}
          {item.dueDate && item.status !== 'levee' ? `pour le ${formatDay(item.dueDate)}` : ''}
        </span>
      </span>
    </Link>
  );
}
