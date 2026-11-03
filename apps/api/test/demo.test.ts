import type { ReserveListItem } from '@obsio/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DemoError, seedDemo } from '../src/demo/seed.js';
import { buildTestApp, clientHelpers, resetDatabase } from './helpers.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
afterAll(() => ctx.close());

const seed = (adminEmail: string) =>
  seedDemo(
    { db: ctx.db, storage: ctx.storage, webUrl: ctx.config.WEB_URL },
    { adminEmail, on: '2026-11-03' },
  );

beforeEach(async () => {
  await resetDatabase();
});

describe('données de démonstration', () => {
  it('remplit une organisation vide, à tous les stades du suivi', async () => {
    const { admin } = await openClient('Usine Démo', 'Alice', 'alice@demo.fr');
    const summary = await seed('alice@demo.fr');
    expect(summary).toMatchObject({ organisationName: 'Usine Démo', sites: 2 });

    const sites = (await admin.get('/api/sites')).json() as { id: string; name: string }[];
    expect(sites.map((s) => s.name).sort()).toEqual(['Entrepôt de Villefranche', 'Usine de Lyon']);
    const lyon = sites.find((s) => s.name === 'Usine de Lyon')!;

    const reserves = (
      await admin.get(`/api/sites/${lyon.id}/reserves`)
    ).json() as ReserveListItem[];
    expect(new Set(reserves.map((r) => r.status))).toEqual(
      new Set(['ouverte', 'assignee', 'corrigee', 'levee']),
    );
    expect(reserves.some((r) => r.overdue)).toBe(true);
    expect(reserves.some((r) => r.reconduite)).toBe(true);
    // Même anomalie dans le rapport du Code du travail et dans le Q18 : une réserve, deux sources.
    const heating = reserves.find((r) => r.description.startsWith('Échauffement anormal'))!;
    expect(heating.sources.map((s) => s.documentType).sort()).toEqual(['periodique', 'q18']);
    expect(heating.equipment?.name).toBe('TD2');

    const imports = (await admin.get(`/api/sites/${lyon.id}/imports`)).json() as {
      status: string;
    }[];
    expect(imports.map((i) => i.status).sort()).toEqual(['a_valider', 'valide', 'valide']);

    // Le lien d'intervention ouvre la vue de l'électricien.
    const [link] = summary.links;
    const token = new URL(link!.url).pathname.split('/').at(-1)!;
    const intervention = await admin.get(`/api/intervention/${token}`);
    expect(intervention.statusCode).toBe(200);
    expect(intervention.json().reserves).toHaveLength(5);

    const schedule = (await admin.get(`/api/sites/${lyon.id}/inspections`)).json() as {
      kind: string;
      status: string;
    }[];
    expect(schedule.find((i) => i.kind === 'q18')?.status).toBe('programmee');
  });

  it('ne touche qu’à l’organisation visée, et jamais à une organisation déjà remplie', async () => {
    await openClient('Usine Démo', 'Alice', 'alice@demo.fr');
    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    await seed('alice@demo.fr');
    expect((await other.admin.get('/api/sites')).json()).toEqual([]);

    await expect(seed('alice@demo.fr')).rejects.toBeInstanceOf(DemoError);
    await expect(seed('inconnu@demo.fr')).rejects.toBeInstanceOf(DemoError);
  });

  it('un site archivé n’empêche pas la démonstration', async () => {
    const { admin } = await openClient('Usine Démo', 'Alice', 'alice@demo.fr');
    const { id } = (await admin.post('/api/sites', { name: 'Essai' })).json();
    expect((await admin.post(`/api/sites/${id}/archive`)).statusCode).toBe(204);
    await expect(seed('alice@demo.fr')).resolves.toMatchObject({ sites: 2 });
  });
});
