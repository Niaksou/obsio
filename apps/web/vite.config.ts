import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Les variables VITE_* sont lues dans le .env à la racine du monorepo.
  envDir: '../..',
  resolve: { conditions: ['@obsio/source'] },
  // `pnpm dev:lan` ouvre le serveur au réseau local pour tester depuis un téléphone.
  server: { port: 5173, strictPort: true, host: process.env.DEV_LAN === '1' },
});
