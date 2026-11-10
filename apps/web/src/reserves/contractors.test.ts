import type { ContractorReserve } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { summary } from './contractors.js';

const reserve = (status: 'assignee' | 'corrigee', overdue = false): ContractorReserve => ({
  contractorId: '00000000-0000-4000-8000-000000000001',
  reserveId: crypto.randomUUID(),
  description: 'Réserve',
  siteId: '00000000-0000-4000-8000-000000000002',
  siteName: 'Usine de Lyon',
  status,
  dueDate: null,
  overdue,
  linkExpired: false,
});

describe('résumé d’un électricien', () => {
  it('compte les réserves en cours, en retard et à vérifier', () => {
    expect(summary([])).toBe('Rien en cours.');
    expect(summary([reserve('assignee'), reserve('assignee', true), reserve('corrigee')])).toBe(
      '2 en cours, dont 1 en retard · 1 corrigée à vérifier',
    );
    expect(summary([reserve('corrigee'), reserve('corrigee')])).toBe('2 corrigées à vérifier');
  });
});
