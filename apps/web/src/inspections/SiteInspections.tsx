import type { Inspection } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api.js';
import { field } from '../components/Form.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';
import {
  InspectionStatusLabel,
  keyDate,
  KIND_SHORT,
  lastVisitLabel,
  nextStep,
  relativeDay,
} from './describe.js';

/** Échéancier d'un site : une carte par type de vérification, avec l'action de l'admin. */
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
      className="site-section"
      data-tour="site-inspections"
      id="verifications"
      aria-labelledby="verifications-title"
    >
      <h2 id="verifications-title">Échéances de contrôle</h2>
      <ul className="rows inspection-cards">
        {inspections.data.map((inspection) => (
          <InspectionRow key={inspection.kind} inspection={inspection} isAdmin={isAdmin} />
        ))}
      </ul>
    </section>
  );
}

/** Ce que fait le bouton de la ligne, selon l'état du suivi. */
function actionLabel(inspection: Inspection) {
  if (!inspection.enabled) return 'Suivre ce contrôle';
  return inspection.plannedDate ? 'Modifier la visite' : 'Programmer la visite';
}

function InspectionRow({ inspection, isAdmin }: { inspection: Inspection; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const key = keyDate(inspection);
  const last = lastVisitLabel(inspection);
  return (
    <li className={inspection.enabled ? 'inspection-card' : 'inspection-card disabled'}>
      <div className="inspection-card-head">
        <span className="row-title">{KIND_SHORT[inspection.kind]}</span>
        <InspectionStatusLabel status={inspection.status} />
      </div>
      <p className="inspection-card-when">
        {key ? (
          <>
            {nextStep(inspection)}
            <span className="inspection-card-relative"> · {relativeDay(key.date)}</span>
          </>
        ) : (
          nextStep(inspection)
        )}
      </p>
      {last && <p className="hint">{last}</p>}
      {inspection.contact && <p className="hint">Contact : {inspection.contact}</p>}
      {isAdmin && !editing && (
        <button type="button" className="secondary compact" onClick={() => setEditing(true)}>
          <CalendarClock size={16} strokeWidth={1.5} aria-hidden />
          {actionLabel(inspection)}
        </button>
      )}
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
      className="inspection-form"
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
