import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, inspectionState } from './inspections.js';

const base = {
  enabled: true,
  periodicityMonths: 12,
  lastVisitDate: '2026-03-12',
  plannedDate: null,
};

describe('échéancier des vérifications', () => {
  it('ajoute des mois en restant dans le mois visé', () => {
    expect(addMonths('2026-03-12', 12)).toBe('2027-03-12');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(daysBetween('2026-11-01', '2026-12-31')).toBe(60);
  });

  it('suit l’échéance : à jour, à programmer, en retard', () => {
    expect(inspectionState(base, '2026-11-01')).toEqual({
      dueDate: '2027-03-12',
      plannedDate: null,
      status: 'a_jour',
    });
    expect(inspectionState(base, '2027-01-11').status).toBe('a_programmer');
    expect(inspectionState(base, '2027-03-13').status).toBe('en_retard');
  });

  it('une visite programmée compte jusqu’à l’import de son rapport', () => {
    const planned = { ...base, plannedDate: '2027-03-01' };
    expect(inspectionState(planned, '2027-02-01').status).toBe('programmee');
    expect(inspectionState(planned, '2027-03-02').status).toBe('rapport_attendu');
    // Le rapport de la visite est importé : la date programmée ne compte plus.
    const done = inspectionState({ ...planned, lastVisitDate: '2027-03-01' }, '2027-03-02');
    expect(done).toEqual({ dueDate: '2028-03-01', plannedDate: null, status: 'a_jour' });
  });

  it('sans rapport ni visite programmée, l’échéance est inconnue ; désactivée, rien n’est suivi', () => {
    expect(inspectionState({ ...base, lastVisitDate: null }, '2026-11-01').status).toBe('inconnue');
    expect(inspectionState({ ...base, enabled: false }, '2028-01-01').status).toBe('desactivee');
  });
});
