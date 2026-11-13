import { LICENCE_PLAN_LABELS, LICENCE_PLANS, licenceSchema, type Licence } from '@obsio/shared';
import { useState, type FormEvent } from 'react';

/** Formulaire des conditions d'une licence (formule, dates, plafonds) ; l'état se change à part. */
export function LicenceFields({ licence }: { licence: Licence }) {
  return (
    <>
      <div className="console-fields">
        <label className="wide">
          Formule
          <select name="plan" defaultValue={licence.plan}>
            {LICENCE_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {LICENCE_PLAN_LABELS[plan]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Début
          <input type="date" name="startsOn" required defaultValue={licence.startsOn} />
        </label>
        <label>
          Fin incluse
          <input type="date" name="endsOn" defaultValue={licence.endsOn ?? ''} />
        </label>
      </div>
      <fieldset className="console-fields caps">
        <legend>Plafonds (vide : sans limite)</legend>
        <label>
          Sites
          <input
            type="number"
            name="maxSites"
            min={0}
            inputMode="numeric"
            defaultValue={licence.maxSites ?? ''}
          />
        </label>
        <label>
          Utilisateurs
          <input
            type="number"
            name="maxMembers"
            min={0}
            inputMode="numeric"
            defaultValue={licence.maxMembers ?? ''}
          />
        </label>
        <label>
          Analyses / mois
          <input
            type="number"
            name="maxAnalysesPerMonth"
            min={0}
            inputMode="numeric"
            defaultValue={licence.maxAnalysesPerMonth ?? ''}
          />
        </label>
      </fieldset>
      <label>
        Note interne
        <textarea name="note" rows={2} maxLength={1000} defaultValue={licence.note ?? ''} />
      </label>
    </>
  );
}

/** Licence lue dans le formulaire, l'état gardé tel quel ; message d'erreur si invalide. */
export function readLicence(
  form: HTMLFormElement,
  status: Licence['status'],
): { licence: Licence } | { error: string } {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '').trim();
  const cap = (name: string) => (text(name) === '' ? null : Number(text(name)));
  const parsed = licenceSchema.safeParse({
    plan: text('plan'),
    status,
    startsOn: text('startsOn'),
    endsOn: text('endsOn') || null,
    maxSites: cap('maxSites'),
    maxMembers: cap('maxMembers'),
    maxAnalysesPerMonth: cap('maxAnalysesPerMonth'),
    note: text('note') || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Licence invalide' };
  return { licence: parsed.data };
}

/** Soumission d'un formulaire de licence, avec l'erreur de validation locale. */
export function useLicenceSubmit(
  status: Licence['status'],
  onValid: (licence: Licence, form: HTMLFormElement) => void,
) {
  const [error, setError] = useState<string | null>(null);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = readLicence(event.currentTarget, status);
    if ('error' in result) return setError(result.error);
    setError(null);
    onValid(result.licence, event.currentTarget);
  }
  return { error, onSubmit };
}
