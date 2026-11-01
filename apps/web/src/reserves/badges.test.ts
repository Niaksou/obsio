import type { ReserveListItem } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { reserveBadges } from './badges.js';

const item = (
  equipmentId: string | null,
  status: ReserveListItem['status'],
  overdue = false,
): ReserveListItem => ({
  id: crypto.randomUUID(),
  siteId: crypto.randomUUID(),
  description: 'x',
  preconisation: null,
  gravite: null,
  status,
  dueDate: null,
  overdue,
  reconduite: false,
  equipment: equipmentId
    ? {
        id: equipmentId,
        name: 'TD',
        floorId: crypto.randomUUID(),
        floorName: 'RDC',
        buildingName: 'A',
        position: null,
      }
    : null,
  sources: [],
  assignedTo: null,
  createdAt: new Date().toISOString(),
});

describe('reserveBadges', () => {
  it('compte les réserves non levées et garde le statut le plus urgent', () => {
    const badges = reserveBadges([
      item('a', 'corrigee'),
      item('a', 'assignee', true),
      item('a', 'levee'),
      item('b', 'corrigee'),
      item(null, 'ouverte'),
    ]);
    expect(badges.get('a')).toEqual({ count: 2, status: 'assignee', overdue: true });
    expect(badges.get('b')).toEqual({ count: 1, status: 'corrigee', overdue: false });
    expect(badges.size).toBe(2);
  });
});
