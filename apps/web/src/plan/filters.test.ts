import type { Equipment } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  matchesSearch,
  matchingIds,
  normalize,
  presentTypes,
  sortForSearch,
} from './filters.js';
import type { ReserveBadge } from './PlanViewer.js';

const item = (id: string, overrides: Partial<Equipment> = {}): Equipment => ({
  id,
  floorId: 'f',
  type: 'td',
  name: id,
  aliases: [],
  position: { x: 0.5, y: 0.5 },
  ...overrides,
});

const items = [
  item('TD1'),
  item('TD2', { aliases: ['Tableau atelier'] }),
  item('BAES quai B', { type: 'eclairage_securite' }),
  item('Presse 3', { type: 'machine', position: null }),
];
const badges = new Map<string, ReserveBadge>([
  ['TD1', { count: 1, status: 'assignee', overdue: false }],
  ['TD2', { count: 2, status: 'ouverte', overdue: true }],
]);

describe('recherche du plan', () => {
  it('ignore accents, casse et espaces', () => {
    expect(normalize('  Éclairage   de SÉCURITÉ ')).toBe('eclairage de securite');
  });

  it('cherche dans le repère, les autres noms et le type', () => {
    expect(matchesSearch(items[1]!, 'atelier')).toBe(true);
    expect(matchesSearch(items[2]!, 'eclairage')).toBe(true);
    expect(matchesSearch(items[2]!, 'baes b')).toBe(true);
    expect(matchesSearch(items[0]!, 'presse')).toBe(false);
  });

  it('ne retient rien de particulier sans critère', () => {
    expect(matchingIds(items, EMPTY_QUERY, badges)).toBeNull();
  });

  it('combine recherche, filtre et type', () => {
    const ids = (query: Partial<typeof EMPTY_QUERY>) => [
      ...(matchingIds(items, { ...EMPTY_QUERY, ...query }, badges) ?? []),
    ];
    expect(ids({ filter: 'reserves' })).toEqual(['TD1', 'TD2']);
    expect(ids({ filter: 'retard' })).toEqual(['TD2']);
    expect(ids({ filter: 'non_places' })).toEqual(['Presse 3']);
    expect(ids({ type: 'td', search: '2' })).toEqual(['TD2']);
  });

  it('filtre par zone, ou hors zone', () => {
    const zones = [
      {
        id: 'z',
        floorId: 'f',
        name: 'Atelier',
        points: [
          { x: 0, y: 0 },
          { x: 0.6, y: 0 },
          { x: 0.6, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ];
    const at = (zone: string) => [
      ...(matchingIds(items, { ...EMPTY_QUERY, zone }, badges, zones) ?? []),
    ];
    expect(at('z')).toEqual(['TD1', 'TD2', 'BAES quai B']);
    expect(at('hors-zone')).toEqual(['Presse 3']);
  });

  it('classe d’abord les repères qui commencent par la recherche', () => {
    const list = [item('Compresseur'), item('Presse 10'), item('Presse 3')];
    expect(sortForSearch(list, 'presse').map((i) => i.name)).toEqual([
      'Presse 3',
      'Presse 10',
      'Compresseur',
    ]);
  });

  it('liste les types présents dans l’ordre des types', () => {
    expect(presentTypes(items)).toEqual(['td', 'eclairage_securite', 'machine']);
  });
});
