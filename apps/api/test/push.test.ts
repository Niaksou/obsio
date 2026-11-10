import { eq } from 'drizzle-orm';
import { generateVAPIDKeys } from 'web-push';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pushSubscription, user } from '../src/db/schema/index.js';
import {
  deliverPush,
  isAllowedEndpoint,
  vapidPublicKey,
  type PushTransport,
  type StoredSubscription,
} from '../src/push/push.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let organisationId: string;

beforeEach(async () => {
  await resetDatabase();
  ctx.emailSender.sent.length = 0;
  ctx.push.jobs.length = 0;
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
});

const subscription = (endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`) => ({
  endpoint,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

async function userId(email: string) {
  const [row] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row!.id;
}

async function newMember(name: string, email: string) {
  const invitationId = await invite(admin, email, 'membre');
  const client = new TestClient(ctx);
  await client.signUpAndVerify(name, email);
  await join(client, invitationId);
  return { client, id: await userId(email) };
}

describe('Abonnements aux notifications', () => {
  it('donne la clé publique et enregistre l’appareil', async () => {
    expect((await admin.get('/api/push/public-key')).json()).toEqual({
      publicKey: ctx.push.publicKey,
    });
    expect((await new TestClient(ctx).get('/api/push/public-key')).statusCode).toBe(401);

    const device = subscription();
    expect((await admin.post('/api/push/subscriptions', device)).statusCode).toBe(204);
    // Réabonnement du même appareil : pas de doublon.
    expect((await admin.post('/api/push/subscriptions', device)).statusCode).toBe(204);
    const rows = await ctx.db.select().from(pushSubscription);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(await userId('alice@dupont.fr'));
  });

  it('refuse une adresse qui n’est pas un service de notification', async () => {
    for (const endpoint of [
      'https://exemple.fr/notifications',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.exemple.fr/x',
      'https://169.254.169.254/latest',
    ]) {
      const response = await admin.post('/api/push/subscriptions', subscription(endpoint));
      expect(response.statusCode).toBe(400);
    }
    expect(await ctx.db.select().from(pushSubscription)).toEqual([]);
  });

  it('un appareil partagé suit le dernier compte ; chacun ne retire que les siens', async () => {
    const { client: bob, id: bobId } = await newMember('Bob', 'bob@dupont.fr');
    const device = subscription();
    await admin.post('/api/push/subscriptions', device);
    await bob.post('/api/push/subscriptions', device);
    const [row] = await ctx.db.select().from(pushSubscription);
    expect(row!.userId).toBe(bobId);

    await admin.post('/api/push/subscriptions/remove', { endpoint: device.endpoint });
    expect(await ctx.db.select().from(pushSubscription)).toHaveLength(1);
    await bob.post('/api/push/subscriptions/remove', { endpoint: device.endpoint });
    expect(await ctx.db.select().from(pushSubscription)).toEqual([]);
  });

  it('garde au plus 10 appareils par compte', async () => {
    for (let i = 0; i < 12; i += 1) await admin.post('/api/push/subscriptions', subscription());
    expect(await ctx.db.select().from(pushSubscription)).toHaveLength(10);
  });
});

describe('Notification d’une réserve confiée', () => {
  it('une notification par site, sans le texte des réserves, ni pour soi-même', async () => {
    const { id: bobId } = await newMember('Bob', 'bob@dupont.fr');
    const lyon = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
    const nantes = (await admin.post('/api/sites', { name: 'Dépôt de Nantes' })).json().id;
    const lyonIds = await seedReserves(ctx, organisationId, lyon, 'alice@dupont.fr', 2);
    const [nantesId] = await seedReserves(ctx, organisationId, nantes, 'alice@dupont.fr', 1);
    const aliceId = await userId('alice@dupont.fr');

    const response = await admin.post('/api/collaborator-assignments', {
      userIds: [bobId, aliceId],
      reserveIds: [...lyonIds, nantesId],
    });
    expect(response.statusCode).toBe(204);
    const jobs = [...ctx.push.jobs].sort((a, b) => a.body.localeCompare(b.body));
    expect(jobs).toEqual([
      {
        userId: bobId,
        title: 'Usine Dupont',
        body: 'Dépôt de Nantes : 1 réserve à corriger',
        url: `/reserves/${nantesId}`,
        tag: 'reserves-confiees-Dépôt de Nantes',
      },
      {
        userId: bobId,
        title: 'Usine Dupont',
        body: 'Usine de Lyon : 2 réserves à corriger',
        url: '/mes-reserves',
        tag: 'reserves-confiees-Usine de Lyon',
      },
    ]);
  });
});

describe('Envoi aux appareils', () => {
  it('envoie à chaque appareil et retire les abonnements expirés', async () => {
    const aliceId = await userId('alice@dupont.fr');
    const [kept, gone] = [subscription(), subscription()];
    for (const s of [kept, gone]) {
      await ctx.db
        .insert(pushSubscription)
        .values({ userId: aliceId, endpoint: s.endpoint, ...s.keys });
    }
    const sent: { endpoint: string; payload: string }[] = [];
    const transport: PushTransport = {
      async send(target: StoredSubscription, payload: string) {
        sent.push({ endpoint: target.endpoint, payload });
        return target.endpoint === gone.endpoint ? 'gone' : 'ok';
      },
    };
    const job = {
      userId: aliceId,
      title: 'Usine Dupont',
      body: 'Lyon : 1 réserve',
      url: '/mes-reserves',
    };
    expect(await deliverPush({ db: ctx.db, transport }, job)).toBe(1);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0]!.payload)).toMatchObject({
      title: 'Usine Dupont',
      url: '/mes-reserves',
    });
    const left = await ctx.db.select().from(pushSubscription);
    expect(left.map((s) => s.endpoint)).toEqual([kept.endpoint]);

    // Service injoignable : la tâche échoue pour être réessayée.
    const failing: PushTransport = {
      async send() {
        throw new Error('timeout');
      },
    };
    await expect(deliverPush({ db: ctx.db, transport: failing }, job)).rejects.toThrow('timeout');
  });
});

describe('Clés et adresses', () => {
  it('dérive la clé publique VAPID de la clé privée', () => {
    const keys = generateVAPIDKeys();
    expect(vapidPublicKey(keys.privateKey)).toBe(keys.publicKey);
  });

  it('reconnaît les services de notification des navigateurs', () => {
    expect(isAllowedEndpoint('https://web.push.apple.com/QGuQ')).toBe(true);
    expect(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedEndpoint('https://fcm.googleapis.com:8443/fcm/send/x')).toBe(false);
    expect(isAllowedEndpoint('https://user@fcm.googleapis.com/fcm/send/x')).toBe(false);
    expect(isAllowedEndpoint('https://push.apple.com.exemple.fr/x')).toBe(false);
    expect(isAllowedEndpoint('pas une adresse')).toBe(false);
  });
});
