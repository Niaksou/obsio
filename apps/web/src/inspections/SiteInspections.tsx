import type { Inspection } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';
import { dateParts, keyDate, KIND_SHORT } from './describe.js';
import { DueLine } from './DueLine.js';

/** Échéancier d'un site : une ligne par type de vérification, réglable par l'admin. */
export function SiteInspections({ siteId, isAdmin }: { siteId: string; isAdmin: boolean }) {
  const inspections = useQuery({
    queryKey: keys.siteInspections(siteId),
    queryFn: () => api.siteInspections(siteId),
  });
  // Lien depuis la page « Échéances de contrôle » : la section arrive après le reste de la page.
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
      <h2 id="verifications-title">Échéances de contrôle</h2>
      <ul className="rows due-rows">
        {inspections.data.map((inspection) => (
          <InspectionRow key={inspection.kind} inspection={inspection} isAdmin={isAdmin} />
        ))}
      </ul>
    </section>
  );
}

const shortDay = (day: string) => {
  const { dayMonth, year } = dateParts(day);
  return `${dayMonth} ${year}`;
};

function InspectionRow({ inspection, isAdmin }: { inspection: Inspection; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const key = keyDate(inspection);
  const last = inspection.lastVisit;
  // Précision : ce que représente la date, et la dernière visite (l'interlocuteur est dans
  // « Régler »).
  const detail = [key?.label, last && `dernière visite le ${shortDay(last.date)}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={inspection.enabled ? undefined : 'disabled'}>
      <div className={isAdmin ? 'due-row has-action' : 'due-row'}>
        <DueLine
          inspection={inspection}
          title={KIND_SHORT[inspection.kind]}
          detail={detail || undefined}
        />
        {isAdmin && (
          <span className="due-action">
            {!editing && (
              <button type="button" className="quiet" onClick={() => setEditing(true)}>
                Régler
              </button>
            )}
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
        Suivre ce contrôle sur le site
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
        Échéance calculée depuis la dernière visite. Rappel aux admins 60 et 30 jours avant, puis 7
        jours avant la visite programmée.
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
