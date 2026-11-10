import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/500.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError } from './api.js';
import { App } from './App.js';
import { onProofSent, startProofQueue } from './offline/proofQueue.js';
import { keys } from './queries.js';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Une ressource absente ou interdite ne réapparaîtra pas en réessayant.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      staleTime: 30_000,
    },
  },
});

// Une preuve partie de la file d'envoi rafraîchit la réserve et la vue de l'intervenant.
onProofSent(({ target }) => {
  void queryClient.invalidateQueries({ queryKey: keys.reserve(target.reserveId) });
  if (target.kind === 'intervention') {
    void queryClient.invalidateQueries({ queryKey: keys.intervention(target.token) });
  } else {
    void queryClient.invalidateQueries({ queryKey: ['sites'] });
  }
});
startProofQueue();

if ('serviceWorker' in navigator) {
  // L'application reste ouvrable sans réseau sur le chantier, et reçoit les notifications (voir
  // public/sw.js). En développement : notifications seulement, sans cache.
  const script = import.meta.env.PROD ? '/sw.js' : '/sw.js?mode=push';
  window.addEventListener('load', () => void navigator.serviceWorker.register(script));
}

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
