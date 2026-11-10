import { createECDH } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { sendNotification } from 'web-push';
import { z } from 'zod';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import { pushSubscription } from '../db/schema/index.js';

// Notifications sur le téléphone (Web Push, RFC 8030/8291/8292). Le contenu est chiffré pour
// l'appareil : le service de notification du navigateur (Apple, Google, Mozilla, Microsoft) ne
// voit que le destinataire et l'heure. Envoi par une file BullMQ, pour ne pas retarder la
// requête et réessayer si le service ne répond pas.

const PUSH_QUEUE = 'push';

/**
 * Services de notification des navigateurs : seule destination acceptée pour un abonnement,
 * puisque l'API envoie ensuite une requête à cette adresse (pas de SSRF, ASVS 1.3.6).
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
];

export function isAllowedEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  return PUSH_HOSTS.some((host) =>
    host.startsWith('.') ? url.hostname.endsWith(host) : url.hostname === host,
  );
}

/** Message affiché : titre, texte, et page de l'application ouverte au toucher. */
export const pushJobSchema = z.object({
  userId: z.uuid(),
  title: z.string().max(100),
  body: z.string().max(300),
  /** Chemin dans l'application, jamais une adresse externe. */
  url: z.string().regex(/^\/(?!\/)/),
  /** Une notification du même tag remplace la précédente sur l'appareil. */
  tag: z.string().max(100).optional(),
});
export type PushJob = z.infer<typeof pushJobSchema>;

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envoi vers le service de notification ; « gone » : abonnement expiré ou retiré. */
export interface PushTransport {
  send(subscription: StoredSubscription, payload: string): Promise<'ok' | 'gone'>;
}

/** Clé publique VAPID (point P-256 non compressé, base64url), dérivée de la clé privée. */
export function vapidPublicKey(privateKey: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  return ecdh.getPublicKey().toString('base64url');
}

export function createWebPushTransport(config: ApiConfig): PushTransport | null {
  if (!config.VAPID_PRIVATE_KEY) return null;
  const vapidDetails = {
    // Contact de l'éditeur pour les services de notification.
    subject: `mailto:${config.OPERATOR_EMAIL}`,
    publicKey: vapidPublicKey(config.VAPID_PRIVATE_KEY),
    privateKey: config.VAPID_PRIVATE_KEY,
  };
  return {
    async send(subscription, payload) {
      try {
        await sendNotification(
          { endpoint: subscription.endpoint, keys: subscription },
          payload,
          // Une notification vieille d'un jour n'a plus d'intérêt.
          { vapidDetails, TTL: 24 * 3600, urgency: 'normal', timeout: 10_000 },
        );
        return 'ok';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';
        throw error;
      }
    },
  };
}

/** Envoie la notification à chaque appareil abonné de l'utilisateur ; retire les expirés. */
export async function deliverPush(deps: { db: Database; transport: PushTransport }, job: PushJob) {
  const { db, transport } = deps;
  const subscriptions = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, job.userId));
  const payload = JSON.stringify({
    title: job.title,
    body: job.body,
    url: job.url,
    tag: job.tag,
  });
  let failure: unknown = null;
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      if ((await transport.send(subscription, payload)) === 'gone') {
        await db.delete(pushSubscription).where(eq(pushSubscription.id, subscription.id));
      } else {
        sent += 1;
      }
    } catch (error) {
      failure = error;
    }
  }
  // Un appareil injoignable : la tâche échoue pour être réessayée (les autres l'ont déjà reçue,
  // le tag évite qu'une notification s'affiche deux fois).
  if (failure) throw failure;
  return sent;
}

/** Ce que l'API attend de la file des notifications (remplaçable dans les tests). */
export interface PushQueue {
  /** Les notifications sont-elles configurées (clé VAPID) ? */
  enabled: boolean;
  publicKey: string | null;
  enqueue(job: PushJob): Promise<void>;
  close(): Promise<void>;
}

export function createPushQueue(
  connection: Redis,
  deps: { db: Database; config: ApiConfig },
  log: { error: (obj: object, msg: string) => void },
): PushQueue {
  const transport = createWebPushTransport(deps.config);
  if (!transport) {
    return { enabled: false, publicKey: null, async enqueue() {}, async close() {} };
  }
  const queue = new Queue(PUSH_QUEUE, { connection });
  const worker = new Worker(
    PUSH_QUEUE,
    async (job) => deliverPush({ db: deps.db, transport }, pushJobSchema.parse(job.data)),
    { connection: connection.duplicate() },
  );
  worker.on('failed', (job, error) =>
    log.error({ err: error, attempts: job?.attemptsMade }, 'Notification non envoyée'),
  );
  return {
    enabled: true,
    publicKey: vapidPublicKey(deps.config.VAPID_PRIVATE_KEY!),
    async enqueue(job) {
      await queue.add('push', pushJobSchema.parse(job), {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: { age: 7 * 24 * 3600 },
      });
    },
    async close() {
      await Promise.all([worker.close(), queue.close()]);
    },
  };
}
