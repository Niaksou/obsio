import { pushSubscriptionInputSchema } from '@obsio/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { pushSubscription } from '../db/schema/index.js';
import { isAllowedEndpoint, type PushQueue } from '../push/push.js';

// Abonnements aux notifications sur le téléphone : chacun gère ceux de ses appareils.

/** Au-delà, les plus anciens sont retirés (appareils changés sans désabonnement). */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

const messageSchema = z.object({ message: z.string() });

export const pushRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  push: PushQueue;
}> = async (app, { db, guards, push }) => {
  const { requireUser } = guards;

  app.get(
    '/api/push/public-key',
    {
      preHandler: requireUser,
      schema: { response: { 200: z.object({ publicKey: z.string().nullable() }) } },
    },
    async () => ({ publicKey: push.publicKey }),
  );

  app.post(
    '/api/push/subscriptions',
    {
      preHandler: requireUser,
      schema: {
        body: pushSubscriptionInputSchema,
        response: { 204: z.null(), 400: messageSchema, 409: messageSchema },
      },
    },
    async (request, reply) => {
      if (!push.enabled) {
        return reply.code(409).send({ message: 'Notifications non configurées sur ce serveur.' });
      }
      const { endpoint, keys } = request.body;
      if (!isAllowedEndpoint(endpoint)) {
        return reply.code(400).send({ message: 'Service de notification non reconnu.' });
      }
      const userId = request.user!.id;
      await db.transaction(async (tx) => {
        // Un appareil partagé passe d'un compte à l'autre : l'abonnement suit le dernier connecté.
        await tx
          .insert(pushSubscription)
          .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
          .onConflictDoUpdate({
            target: pushSubscription.endpoint,
            set: { userId, p256dh: keys.p256dh, auth: keys.auth, createdAt: new Date() },
          });
        const rows = await tx
          .select({ id: pushSubscription.id })
          .from(pushSubscription)
          .where(eq(pushSubscription.userId, userId))
          .orderBy(asc(pushSubscription.createdAt));
        const excess = rows.slice(0, Math.max(0, rows.length - MAX_SUBSCRIPTIONS_PER_USER));
        if (excess.length) {
          await tx.delete(pushSubscription).where(
            inArray(
              pushSubscription.id,
              excess.map((row) => row.id),
            ),
          );
        }
      });
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/api/push/subscriptions/remove',
    {
      preHandler: requireUser,
      schema: {
        body: pushSubscriptionInputSchema.pick({ endpoint: true }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await db
        .delete(pushSubscription)
        .where(
          and(
            eq(pushSubscription.endpoint, request.body.endpoint),
            eq(pushSubscription.userId, request.user!.id),
          ),
        );
      return reply.code(204).send(null);
    },
  );
};
