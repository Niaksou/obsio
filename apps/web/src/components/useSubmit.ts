import { useState } from 'react';
import { errorMessage } from '../auth-client.js';

type Result = { error: { code?: string; message?: string } | null };

/** État d'envoi d'un formulaire appelant Better Auth : en cours, erreur affichable. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Result>): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      setError(errorMessage(result.error));
      return !result.error;
    } catch {
      setError('Serveur injoignable. Réessayez dans un instant.');
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, run };
}
