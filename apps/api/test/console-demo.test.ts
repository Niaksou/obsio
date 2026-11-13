import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setStaff } from '../src/console/staff.js';
import { createDatabase } from '../src/db/client.js';
import { DEMO_CLIENTS, seedConsoleDemo } from '../src/demo/console.js';
import { DemoError } from '../src/demo/seed.js';
import { passkeySession } from './passkey-session.js';
import { buildTestApp, clientHelpers, resetDatabase } from './helpers.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
const owner = createDatabase(process.env.TEST_DATABASE_OWNER_URL!);
afterAll(async () => {
  await owner.pool.end();
  await ctx.close();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('clients fictifs de la console', () => {
  it('remplit la console avec des licences dans tous les états, une seule fois', async () => {
    const { admin: staff } = await openClient('Obsio', 'Camille', 'camille@obsio.fr');
    await setStaff(owner.db, 'camille@obsio.fr', true);
    const summary = await seedConsoleDemo(ctx.db);
    expect(summary.clients).toBe(DEMO_CLIENTS.length);
    expect(summary.analyses).toBeGreaterThan(50);
    await expect(seedConsoleDemo(ctx.db)).rejects.toBeInstanceOf(DemoError);

    const console = await passkeySession(ctx, staff);
    const clients = (await console.get('/api/console/clients')).json() as {
      name: string;
      access: { access: string; reason: string | null; daysLeft: number | null };
      analysesThisMonth: number;
      lastLoginAt: string | null;
    }[];
    const byName = (name: string) => clients.find((c) => c.name === `${name} (démo)`)!;
    expect(clients.filter((c) => c.name.endsWith('(démo)'))).toHaveLength(DEMO_CLIENTS.length);
    expect(byName('Clinique du Parc').access.daysLeft).toBe(8);
    expect(byName('Menuiserie Aubert').access).toMatchObject({
      access: 'lecture',
      reason: 'suspendue',
    });
    expect(byName('Plasturgie Ventoux').access).toMatchObject({
      access: 'lecture',
      reason: 'revoquee',
    });
    expect(byName('Imprimerie Garnier').analysesThisMonth).toBeGreaterThanOrEqual(18);
    expect(byName('Cartonnerie Lemoine').lastLoginAt).toBeNull();

    const usage = (await console.get('/api/console/usage?days=90')).json();
    expect(usage.quality.map((q: { promptVersion: string }) => q.promptVersion).sort()).toEqual([
      'v3',
      'v4',
    ]);
    expect(usage.pages.length).toBeGreaterThan(5);
  });
});
