import pg from 'pg';
import { buildApp } from '../src/app.js';
import { loadConfig, type ApiConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { organisation } from '../src/db/schema/index.js';
import { createMemorySender } from '../src/email/sender.js';
import { createRedis } from '../src/redis.js';

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

/** Application complète branchée sur la base de test, avec les e-mails gardés en mémoire. */
export async function buildTestApp() {
  const config = testConfig();
  const { pool, db } = createDatabase(config.DATABASE_URL);
  const redis = createRedis(config.REDIS_URL);
  const emailSender = createMemorySender();
  const app = await buildApp({ config, pool, db, redis, emailSender });
  return {
    app,
    db,
    redis,
    config,
    emailSender,
    async close() {
      await app.close();
      await Promise.all([pool.end(), redis.quit()]);
    },
  };
}

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Client HTTP de test qui garde les cookies de session, comme un navigateur. */
export class TestClient {
  private cookies = new Map<string, string>();

  constructor(private readonly ctx: TestApp) {}

  async request(method: 'GET' | 'POST', url: string, body?: object) {
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

  /** Inscription, puis clic sur le lien de vérification reçu par e-mail (connecte l'utilisateur). */
  async signUpAndVerify(name: string, email: string) {
    const signUp = await this.post('/api/auth/sign-up/email', {
      name,
      email,
      password: 'mot-de-passe-solide',
    });
    if (signUp.statusCode !== 200) throw new Error(`Inscription refusée : ${signUp.body}`);
    const link = lastLinkSentTo(this.ctx, email);
    const verify = await this.get(link.pathname + link.search);
    if (verify.statusCode >= 400) throw new Error(`Vérification refusée : ${verify.body}`);
  }
}

export function lastLinkSentTo(ctx: TestApp, email: string): URL {
  const sent = ctx.emailSender.sent.filter((mail) => mail.to === email).at(-1);
  const match = sent?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`Aucun lien envoyé à ${email}`);
  return new URL(match[0]);
}
