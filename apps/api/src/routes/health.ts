import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { z } from 'zod';

const checkSchema = z.enum(['ok', 'erreur']);

export const healthRoutes: FastifyPluginAsyncZod<{ pool: pg.Pool; redis: Redis }> = async (
  app,
  { pool, redis },
) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({ database: checkSchema, redis: checkSchema }),
          503: z.object({ database: checkSchema, redis: checkSchema }),
        },
      },
    },
    async (request, reply) => {
      const [database, cache] = await Promise.all([
        pool.query('select 1').then(
          () => 'ok' as const,
          (error: unknown) => {
            request.log.error({ err: error }, 'Base de données injoignable');
            return 'erreur' as const;
          },
        ),
        redis.ping().then(
          () => 'ok' as const,
          (error: unknown) => {
            request.log.error({ err: error }, 'Redis injoignable');
            return 'erreur' as const;
          },
        ),
      ]);
      const body = { database, redis: cache };
      return database === 'ok' && cache === 'ok' ? body : reply.code(503).send(body);
    },
  );
};
