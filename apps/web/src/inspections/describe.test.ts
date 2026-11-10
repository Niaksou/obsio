import type { Inspection } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { dateParts, keyDate, relativeDay } from './describe.js';

const base: Inspection = {
  siteId: '00000000-0000-4000-8000-000000000001',
  siteName: 'Usine de Lyon',
  kind: 'periodique',
  enabled: true,
  periodicityMonths: 12,
  lastVisit: null,
  dueDate: '2026-11-23',
  plannedDate: '2026-11-15',
  contact: null,
  status: 'a_jour',
};

describe('échéancier des vérifications', () => {
  it('retient la date qui compte selon l’état', () => {
    expect(keyDate({ ...base, status: 'programmee' })).toEqual({
      date: '2026-11-15',
      label: 'Visite programmée',
    });
    expect(keyDate({ ...base, status: 'en_retard' })?.date).toBe('2026-11-23');
    expect(keyDate({ ...base, status: 'a_programmer' })?.label).toBe('Visite à faire avant');
    expect(keyDate({ ...base, status: 'inconnue', dueDate: null })).toBeNull();
  });

  it('donne un délai court, en jours puis en mois', () => {
    const today = new Date(2026, 10, 10);
    expect(relativeDay('2026-11-10', today)).toBe('aujourd’hui');
    expect(relativeDay('2026-11-23', today)).toBe('dans 13 j');
    expect(relativeDay('2026-11-05', today)).toBe('il y a 5 j');
    expect(relativeDay('2027-03-03', today)).toBe('dans 4 mois');
  });

  it('découpe la date pour la colonne', () => {
    expect(dateParts('2026-11-23')).toEqual({ dayMonth: '23 nov.', year: '2026' });
  });
});
