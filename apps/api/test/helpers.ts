import { loadConfig, type ApiConfig } from '../src/config.js';

/** Configuration de test : base saas_test à la place de la base de développement. */
export function testConfig(): ApiConfig {
  const { TEST_DATABASE_URL } = process.env;
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL doit être défini pour les tests');
  return loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL });
}
