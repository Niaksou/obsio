import { defaultLicence, licenceAccess, type ConsoleClient, type Licence } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { watchItems } from './watch.js';

const now = Date.parse('2026-11-13T10:00:00Z');

function client(
  name: string,
  changes: Partial<ConsoleClient> = {},
  licence: Partial<Licence> = {},
) {
  const full = { ...defaultLicence('2026-01-01'), ...licence };
  return {
    id: name,
    name,
    slug: name,
    createdAt: '2026-01-01T00:00:00Z',
    licence: full,
    access: licenceAccess(full, '2026-11-13'),
    members: 2,
    pendingInvitations: 0,
    sites: 1,
    analysesThisMonth: 2,
    failedAnalysesThisMonth: 0,
    ocrPagesThisMonth: 10,
    lastLoginAt: '2026-11-12T08:00:00Z',
    ...changes,
  } satisfies ConsoleClient;
}

describe('à surveiller', () => {
  it('ne signale rien pour un client actif sans échéance proche', () => {
    expect(watchItems([client('Calme')], now)).toEqual([]);
  });

  it('signale échéances, silences, plafonds et échecs, le plus urgent d’abord dans chaque groupe', () => {
    const items = watchItems(
      [
        client('Bientôt', {}, { endsOn: '2026-11-20' }),
        client('Coupé', {}, { status: 'revoquee' }),
        client('Muet', { lastLoginAt: '2026-09-01T00:00:00Z' }),
        client('Jamais', { lastLoginAt: null, createdAt: '2026-10-01T00:00:00Z' }),
        client('Nouveau', { lastLoginAt: null, createdAt: '2026-11-10T00:00:00Z' }),
        client('Plein', { sites: 4 }, { maxSites: 5 }),
        client('Raté', { failedAnalysesThisMonth: 2 }),
      ],
      now,
    );
    const byGroup = (group: string) =>
      items.filter((i) => i.group === group).map((i) => [i.client.name, i.reason]);
    expect(byGroup('licence')).toEqual([
      ['Coupé', 'Licence révoquée : lecture seule'],
      ['Bientôt', 'Licence finie dans 7 jours'],
    ]);
    expect(byGroup('silence')).toEqual([
      ['Muet', 'Dernière connexion il y a 73 jours'],
      ['Jamais', "Ouvert il y a 43 jours, personne ne s'est encore connecté"],
    ]);
    expect(byGroup('plafond')).toEqual([['Plein', '4 / 5 sites']]);
    expect(byGroup('echecs')).toEqual([['Raté', '2 analyses en échec sur 2']]);
  });
});
