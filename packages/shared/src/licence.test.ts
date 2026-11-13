import { describe, expect, it } from 'vitest';
import { defaultLicence, licenceAccess, licenceSchema, parisDate } from './licence.js';

const today = '2026-11-12';
const base = defaultLicence('2026-01-01');

describe('licence', () => {
  it('laisse tout faire à une licence active, jusqu’au dernier jour inclus', () => {
    expect(licenceAccess(base, today)).toMatchObject({ access: 'complet', daysLeft: null });
    expect(licenceAccess({ ...base, endsOn: today }, today)).toMatchObject({
      access: 'complet',
      daysLeft: 0,
    });
    expect(licenceAccess({ ...base, endsOn: '2026-11-26' }, today).daysLeft).toBe(14);
  });

  it('passe en lecture seule une licence échue, suspendue ou révoquée', () => {
    expect(licenceAccess({ ...base, endsOn: '2026-11-11' }, today)).toMatchObject({
      access: 'lecture',
      reason: 'expiree',
    });
    expect(licenceAccess({ ...base, status: 'suspendue' }, today).reason).toBe('suspendue');
    // La révocation l'emporte sur l'échéance.
    expect(licenceAccess({ ...base, status: 'revoquee', endsOn: '2026-01-31' }, today).reason).toBe(
      'revoquee',
    );
  });

  it('refuse une fin avant le début', () => {
    expect(licenceSchema.safeParse({ ...base, endsOn: '2025-12-31' }).success).toBe(false);
    expect(licenceSchema.safeParse({ ...base, endsOn: '2026-01-01' }).success).toBe(true);
  });

  it('compte les jours à l’heure de Paris', () => {
    // 23 h 30 à Londres le 31 décembre : déjà le 1er janvier à Paris.
    expect(parisDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
