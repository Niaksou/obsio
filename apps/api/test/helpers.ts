import { createHmac } from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';
import type { FileScanner } from '../src/antivirus.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type ApiConfig } from '../src/config.js';
import { createDatabase, withOrganisation, type Database } from '../src/db/client.js';
import { eq } from 'drizzle-orm';
import { organisation, reportImport, reserve, user } from '../src/db/schema/index.js';
import { createMemorySender } from '../src/email/sender.js';
import type { ExtractionQueue } from '../src/imports/queue.js';
import { createFailFastRedis } from '../src/redis.js';
import { createStorage } from '../src/storage.js';
import { provisionOrganisation } from '../src/organisations/provision.js';

/** Configuration de test : base obsio_test à la place de la base de développement. */
export function testConfig(): ApiConfig {
  const { TEST_DATABASE_URL } = process.env;
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL doit être défini pour les tests');
  return loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL });
}

/** Vide toutes les tables avec le rôle propriétaire (app_user n'a pas le droit TRUNCATE). */
export async function resetDatabase(): Promise<void> {
  const { TEST_DATABASE_OWNER_URL } = process.env;
  if (!TEST_DATABASE_OWNER_URL) throw new Error('TEST_DATABASE_OWNER_URL doit être défini');
  const client = new pg.Client({ connectionString: TEST_DATABASE_OWNER_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length === 0) return;
    const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
    await client.query(`truncate ${tables} cascade`);
  } finally {
    await client.end();
  }
}

export async function createOrganisation(db: Database, name: string) {
  const [created] = await db
    .insert(organisation)
    .values({ name, slug: `${name.toLowerCase()}-${crypto.randomUUID()}` })
    .returning();
  if (!created) throw new Error('Organisation non créée');
  return created;
}

/** File d'extraction factice : les tests jouent le rôle du worker en déposant extraction.json. */
function createFakeQueue() {
  const jobs: { organisationId: string; importId: string }[] = [];
  const failures = new Map<string, string>();
  /** Imports dont la tâche est en cours d'exécution : ils ne peuvent pas être retirés. */
  const running = new Set<string>();
  const queue: ExtractionQueue & {
    jobs: typeof jobs;
    failures: typeof failures;
    running: typeof running;
  } = {
    jobs,
    failures,
    running,
    async enqueue(job) {
      jobs.push(job);
    },
    async failure(importId) {
      return failures.get(importId) ?? null;
    },
    async discard(importId) {
      if (running.has(importId)) return false;
      const index = jobs.findIndex((job) => job.importId === importId);
      if (index >= 0) jobs.splice(index, 1);
      return true;
    },
    watch() {},
    async close() {},
  };
  return queue;
}

/**
 * Fichier de test EICAR, reconnu par tous les antivirus : assemblé ici pour que le dépôt ne le
 * contienne pas tel quel.
 */
export const EICAR = [
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
  'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
].join('');

/** Antivirus de test, sans ClamAV : reconnaît la signature EICAR. */
export const testScanner: FileScanner = {
  scan: async (data) =>
    data.includes(EICAR)
      ? { infected: true, signature: 'Eicar-Test-Signature' }
      : { infected: false },
};

/** Application complète branchée sur la base de test, avec les e-mails gardés en mémoire. */
export async function buildTestApp() {
  const config = testConfig();
  const { pool, db } = createDatabase(config.DATABASE_URL);
  const redis = await createFailFastRedis(config.REDIS_URL);
  const emailSender = createMemorySender();
  const storage = createStorage(config);
  await storage.ensureBucket(config.WEB_URL);
  const queue = createFakeQueue();
  const scanner = testScanner;
  const app = await buildApp({ config, pool, db, redis, emailSender, storage, scanner, queue });
  return {
    app,
    scanner,
    pool,
    db,
    redis,
    config,
    emailSender,
    storage,
    queue,
    async close() {
      await app.close();
      await Promise.all([pool.end(), redis.quit()]);
      storage.close();
    },
  };
}

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

export const TEST_PASSWORD = 'cheval-agrafe-batterie-42';

/** Code TOTP (RFC 6238) d'un secret en base 32, décalé de `step` périodes de 30 secondes. */
export function totp(secret: string, step = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '')) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + step));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Client HTTP de test qui garde les cookies de session, comme un navigateur. */
export class TestClient {
  private cookies = new Map<string, string>();
  /** Secret TOTP du compte, une fois la double authentification activée. */
  twoFactorSecret: string | null = null;
  backupCodes: string[] = [];

  constructor(private readonly ctx: TestApp) {}

  async request(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, body?: object) {
    const response = await this.ctx.app.inject({
      method,
      url,
      headers: {
        origin: this.ctx.config.WEB_URL,
        cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      ...(body ? { payload: body } : {}),
    });
    for (const cookie of response.cookies) {
      if (cookie.value === '' || cookie.maxAge === 0) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }

  get(url: string) {
    return this.request('GET', url);
  }

  post(url: string, body: object = {}) {
    return this.request('POST', url, body);
  }

  patch(url: string, body: object) {
    return this.request('PATCH', url, body);
  }

  put(url: string, body: object) {
    return this.request('PUT', url, body);
  }

  /**
   * Inscription, clic sur le lien de vérification reçu par e-mail (connecte l'utilisateur), puis
   * activation de la double authentification, obligatoire, sauf `{ twoFactor: false }`.
   */
  async signUpAndVerify(name: string, email: string, { twoFactor = true } = {}) {
    const signUp = await this.post('/api/auth/sign-up/email', {
      name,
      email,
      password: TEST_PASSWORD,
    });
    if (signUp.statusCode !== 200) throw new Error(`Inscription refusée : ${signUp.body}`);
    const link = lastLinkSentTo(this.ctx, email);
    const verify = await this.get(link.pathname + link.search);
    if (verify.statusCode >= 400) throw new Error(`Vérification refusée : ${verify.body}`);
    if (twoFactor) await this.enableTwoFactor();
  }

  /** Active la double authentification comme le front : mot de passe, puis premier code. */
  async enableTwoFactor() {
    const enable = await this.post('/api/auth/two-factor/enable', { password: TEST_PASSWORD });
    if (enable.statusCode !== 200) throw new Error(`Activation refusée : ${enable.body}`);
    const { totpURI, backupCodes } = enable.json() as { totpURI: string; backupCodes: string[] };
    this.twoFactorSecret = new URL(totpURI).searchParams.get('secret');
    this.backupCodes = backupCodes;
    const verify = await this.post('/api/auth/two-factor/verify-totp', {
      code: totp(this.twoFactorSecret!),
    });
    if (verify.statusCode !== 200) throw new Error(`Premier code refusé : ${verify.body}`);
  }

  /**
   * Connexion par mot de passe puis code TOTP de la période suivante (celui de la période en
   * cours a pu servir à l'activation, et un code ne sert qu'une fois).
   */
  async signIn(email: string, password = TEST_PASSWORD) {
    const response = await this.post('/api/auth/sign-in/email', { email, password });
    if (response.statusCode !== 200 || !response.json().twoFactorRedirect) return response;
    return this.post('/api/auth/two-factor/verify-totp', { code: totp(this.twoFactorSecret!, 1) });
  }
}

export function lastLinkSentTo(ctx: TestApp, email: string): URL {
  const sent = ctx.emailSender.sent.filter((mail) => mail.to === email).at(-1);
  const match = sent?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`Aucun lien envoyé à ${email}`);
  return new URL(match[0]);
}

/** Parcours d'ouverture d'un client et d'invitation, partagés par les tests. */
export function clientHelpers(ctx: TestApp) {
  /** Ouvre un client comme le fait « pnpm org:create », puis son admin s'inscrit et accepte. */
  async function openClient(name: string, adminName: string, adminEmail: string) {
    const { organisation, invitation } = await provisionOrganisation(ctx, { name, adminEmail });
    const admin = new TestClient(ctx);
    await admin.signUpAndVerify(adminName, adminEmail);
    const accept = await admin.post('/api/auth/organization/accept-invitation', {
      invitationId: invitation.id,
    });
    expect(accept.statusCode).toBe(200);
    return { admin, organisationId: organisation.id };
  }

  async function invite(admin: TestClient, email: string, role: 'admin' | 'membre') {
    const response = await admin.post('/api/auth/organization/invite-member', { email, role });
    expect(response.statusCode).toBe(200);
    return lastLinkSentTo(ctx, email).pathname.split('/').at(-1)!;
  }

  async function join(client: TestClient, invitationId: string) {
    const response = await client.post('/api/auth/organization/accept-invitation', {
      invitationId,
    });
    expect(response.statusCode).toBe(200);
  }

  return { openClient, invite, join };
}

/** Réserves déjà validées : on les crée en base plutôt que de rejouer tout un import. */
export async function seedReserves(
  ctx: TestApp,
  orgId: string,
  site: string,
  adminEmail: string,
  count: number,
) {
  const [author] = await ctx.db.select().from(user).where(eq(user.email, adminEmail));
  return withOrganisation(ctx.db, orgId, async (tx) => {
    const [created] = await tx
      .insert(reportImport)
      .values({
        organisationId: orgId,
        siteId: site,
        fileName: 'rapport.pdf',
        pdfKey: 'cle',
        status: 'valide',
        createdBy: author!.id,
      })
      .returning();
    const rows = await tx
      .insert(reserve)
      .values(
        Array.from({ length: count }, (_, i) => ({
          organisationId: orgId,
          siteId: site,
          importId: created!.id,
          description: `Réserve ${i + 1}`,
          dueDate: i === 0 ? '2020-01-01' : null,
        })),
      )
      .returning();
    return rows.map((row) => row.id);
  });
}
