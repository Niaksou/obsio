import { INSPECTION_KIND_LABELS, type Inspection } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';
import { InspectionStatusLabel, lastVisitLabel, nextStep } from './describe.js';

/** Échéancier d'un site : une ligne par type de vérification, réglable par l'admin. */
export function SiteInspections({ siteId, isAdmin }: { siteId: string; isAdmin: boolean }) {
  const inspections = useQuery({
    queryKey: keys.siteInspections(siteId),
    queryFn: () => api.siteInspections(siteId),
  });
  // Lien depuis la page « Vérifications » : la section arrive après le reste de la page.
  const { hash } = useLocation();
  const section = useRef<HTMLElement>(null);
  const loaded = Boolean(inspections.data);
  useEffect(() => {
    if (loaded && hash === '#verifications') section.current?.scrollIntoView();
  }, [loaded, hash]);
  if (inspections.error) return <p className="error">{inspections.error.message}</p>;
  if (!inspections.data) return null;

  return (
    <section
      ref={section}
      className="inspections"
      data-tour="site-inspections"
      id="verifications"
      aria-labelledby="verifications-title"
    >
      <h2 id="verifications-title">Prochaines vérifications</h2>
      <ul className="rows">
        {inspections.data.map((inspection) => (
          <InspectionRow key={inspection.kind} inspection={inspection} isAdmin={isAdmin} />
        ))}
      </ul>
    </section>
  );
}

function InspectionRow({ inspection, isAdmin }: { inspection: Inspection; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const last = lastVisitLabel(inspection);
  return (
    <li className={`inspection-row${inspection.enabled ? '' : ' disabled'}`}>
      <div className="inspection-summary">
        <span className="row-title">{INSPECTION_KIND_LABELS[inspection.kind]}</span>
        <InspectionStatusLabel status={inspection.status} />
        <span className="inspection-next">{nextStep(inspection)}</span>
        {isAdmin && !editing && (
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            Régler
          </button>
        )}
        {(last || inspection.contact) && (
          <span className="row-meta">
            {[last, inspection.contact && `Contact : ${inspection.contact}`]
              .filter(Boolean)
              .join('. ')}
          </span>
        )}
      </div>
      {editing && <InspectionForm inspection={inspection} onDone={() => setEditing(false)} />}
    </li>
  );
}

function InspectionForm({ inspection, onDone }: { inspection: Inspection; onDone: () => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (data: FormData) =>
      api.updateInspection(inspection.siteId, inspection.kind, {
        enabled: data.get('enabled') === 'on',
        periodicityMonths: Number(field(data, 'periodicityMonths')),
        plannedDate: field(data, 'plannedDate') || null,
        contact: field(data, 'contact') || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.inspections });
      onDone();
    },
  });
  const months = inspection.periodicityMonths;

  return (
    <form
      className="inline-form compact inspection-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(new FormData(event.currentTarget));
      }}
    >
      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={inspection.enabled} />
        Suivre cette vérification sur le site
      </label>
      <div className="fields">
        <label className="narrow">
          Tous les
          <select name="periodicityMonths" defaultValue={months}>
            {[...new Set([6, 12, 18, 24, 36, months])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} mois
                </option>
              ))}
          </select>
        </label>
        <label>
          Visite programmée le
          <input
            type="date"
            name="plannedDate"
            defaultValue={inspection.plannedDate ?? ''}
            min={inspection.lastVisit?.date}
          />
        </label>
      </div>
      <label>
        Organisme et interlocuteur
        <input
          name="contact"
          maxLength={500}
          defaultValue={inspection.contact ?? ''}
          placeholder="Bureau de contrôle, nom, téléphone"
        />
      </label>
      <p className="hint">
        L’échéance part de la dernière visite d’après les rapports importés. Les admins reçoivent un
        rappel 60 et 30 jours avant, puis 7 jours avant la visite programmée.
      </p>
      <div className="actions">
        <button type="submit" disabled={save.isPending}>
          Enregistrer
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          Annuler
        </button>
      </div>
      <MutationError error={save.error} />
    </form>
  );
}
