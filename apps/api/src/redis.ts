import { Redis } from 'ioredis';

export function createRedis(url: string): Redis {
  // maxRetriesPerRequest: null est exigé par BullMQ.
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Connexion de la limitation de débit, des quotas et du contrôle de santé : si Redis est
 * injoignable, la commande échoue en une seconde au plus et la requête est refusée (ASVS
 * 16.5.3), au lieu d'attendre le retour de Redis ou de passer sans limite.
 */
export async function createFailFastRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    commandTimeout: 1000,
  });
  // Les pannes se voient aux commandes refusées et dans /health, qui les journalise.
  redis.on('error', () => {});
  // Démarrage sans Redis : l'API démarre quand même, et refuse jusqu'à son retour.
  await new Promise<void>((resolve) => {
    redis.once('ready', resolve);
    redis.once('error', () => resolve());
  });
  return redis;
}
