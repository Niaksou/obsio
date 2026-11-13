import { READ_ONLY_MESSAGES } from '@obsio/shared';
import { useMe } from '../queries.js';

/** Échéance proche : prévenir les admins à partir de 14 jours avant la fin. */
const WARNING_DAYS = 14;

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });

function remaining(days: number) {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

/**
 * État de la licence du client : lecture seule pour tous, échéance proche pour les admins
 * (ce sont eux qui la font prolonger).
 */
export function LicenceBanner() {
  const { data: me } = useMe();
  const organisation = me?.organisation;
  if (!organisation) return null;
  const { licence } = organisation;

  if (licence.access === 'lecture') {
    return (
      <div className="alert alert-danger licence-banner" role="status">
        <span className="alert-title">Lecture seule</span>
        <span>{READ_ONLY_MESSAGES[licence.reason!]} Contactez Obsio pour la réactiver.</span>
      </div>
    );
  }
  if (
    organisation.role === 'admin' &&
    licence.endsOn &&
    licence.daysLeft !== null &&
    licence.daysLeft <= WARNING_DAYS
  ) {
    return (
      <div className="alert alert-pending licence-banner" role="status">
        <span>
          Votre licence se termine le {dateFormat.format(new Date(licence.endsOn))} (
          {remaining(licence.daysLeft)}). Contactez Obsio pour la prolonger.
        </span>
      </div>
    );
  }
  return null;
}
