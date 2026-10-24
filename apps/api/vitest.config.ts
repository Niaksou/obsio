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
  test: {
    env: { NODE_ENV: 'test' },
    // Les tests partagent une même base : on les exécute un fichier à la fois.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
  },
});
