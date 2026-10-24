import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@obsio/source'] },
  ssr: { resolve: { conditions: ['@obsio/source'] } },
});
