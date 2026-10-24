import { defineConfig } from 'vitest/config';

// En local, les variables viennent du .env racine ; en CI, de l'environnement.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Pas de fichier .env : rien à charger.
}

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: { env: { NODE_ENV: 'test' } },
});
