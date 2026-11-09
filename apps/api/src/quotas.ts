import type { Redis } from 'ioredis';

// Quotas par organisation (ASVS 2.4.1, 15.2.2) : bornent les opérations coûteuses, appel à
// Mistral pour l'analyse d'un rapport et génération d'un dossier PDF, quelle que soit la
// session ou l'adresse IP. Compteurs dans Redis, fenêtre fixe ouverte par la première
// opération ; si Redis est injoignable, l'opération est refusée.

export interface Quota {
  name: string;
  max: number;
  windowSeconds: number;
  /** Message affiché quand le quota est atteint, suivi du délai d'attente. */
  label: string;
}

export const QUOTAS = {
  analyses: {
    name: 'analyses',
    max: 20,
    windowSeconds: 24 * 3600,
    label: '20 analyses de rapport par jour',
  },
  dossiers: {
    name: 'dossiers',
    max: 30,
    windowSeconds: 3600,
    label: '30 dossiers de preuves par heure',
  },
} satisfies Record<string, Quota>;

/** Réponse 429 avec ce message, par le gestionnaire d'erreurs (`errors.ts`). */
export class QuotaExceeded extends Error {
  readonly statusCode = 429;
  constructor(quota: Quota, retryAfterSeconds: number) {
    super(`Limite atteinte : ${quota.label} pour votre organisation. ${wait(retryAfterSeconds)}`);
  }
}

function wait(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `Réessayez dans ${minutes} min.`;
  return `Réessayez dans ${Math.ceil(minutes / 60)} h.`;
}

export interface Quotas {
  /** Refuse si le quota est déjà atteint, sans rien consommer. */
  check(quota: Quota, organisationId: string): Promise<void>;
  /** Consomme une opération, ou refuse si le quota est atteint. */
  consume(quota: Quota, organisationId: string): Promise<void>;
}

export function createQuotas(redis: Redis): Quotas {
  const key = (quota: Quota, organisationId: string) =>
    `obsio-quota:${quota.name}:${organisationId}`;

  async function refuse(quota: Quota, k: string): Promise<never> {
    const ttl = await redis.ttl(k);
    throw new QuotaExceeded(quota, ttl > 0 ? ttl : quota.windowSeconds);
  }

  return {
    async check(quota, organisationId) {
      const k = key(quota, organisationId);
      if (Number(await redis.get(k)) >= quota.max) await refuse(quota, k);
    },
    async consume(quota, organisationId) {
      const k = key(quota, organisationId);
      const results = await redis.multi().incr(k).expire(k, quota.windowSeconds, 'NX').exec();
      const [error, used] = results?.[0] ?? [new Error('Quota illisible')];
      if (error) throw error;
      if (Number(used) > quota.max) {
        await redis.decr(k);
        await refuse(quota, k);
      }
    },
  };
}
