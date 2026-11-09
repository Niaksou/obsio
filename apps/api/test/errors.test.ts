import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildTestApp } from './helpers.js';

const ctx = await buildTestApp();
// Routes d'essai, ajoutées avant le premier appel (Fastify les refuse ensuite).
ctx.app.get('/api/essai/erreur', async () => {
  throw new Error('relation "table_secrete" does not exist');
});
ctx.app.post(
  '/api/essai/validation',
  { schema: { body: z.object({ email: z.email() }) } },
  async () => ({ ok: true }),
);
afterAll(() => ctx.close());

describe("en-têtes et erreurs de l'API", () => {
  it('ne renvoie pas le détail d’une erreur interne', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/essai/erreur' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('table_secrete');
    expect(response.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erreur interne du serveur. Réessayez plus tard.',
    });
  });

  it('interdit la mise en cache des réponses', async () => {
    const health = await ctx.app.inject({ method: 'GET', url: '/health' });
    const denied = await ctx.app.inject({ method: 'GET', url: '/api/me' });
    const session = await ctx.app.inject({ method: 'GET', url: '/api/auth/get-session' });
    for (const response of [health, denied, session]) {
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('garde le message d’une erreur de validation', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/essai/validation',
      payload: { email: 'pas-une-adresse' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('email');
  });
});
