import type { passkey } from '@better-auth/passkey';
import { APIError } from 'better-auth/api';
import type { ApiConfig } from '../config.js';

type PasskeyOptions = NonNullable<Parameters<typeof passkey>[0]>;

const userNotVerified = () =>
  new APIError('UNAUTHORIZED', {
    code: 'PASSKEY_USER_VERIFICATION_REQUIRED',
    message: 'Déverrouillez la passkey par Face ID, empreinte ou code de l’appareil.',
  });

/**
 * Passkeys liées au domaine du front (rpID) et vérifiées contre son origine exacte, jamais
 * contre l'en-tête Origin de la requête. La vérification de l'utilisateur (biométrie ou code
 * de l'appareil) est exigée : sans elle, la passkey ne serait qu'un seul facteur.
 */
export function passkeyOptions(config: ApiConfig): PasskeyOptions {
  const web = new URL(config.WEB_URL);
  return {
    rpID: web.hostname,
    rpName: 'Obsio',
    origin: web.origin,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    registration: {
      requireSession: true,
      afterVerification: async ({ verification }) => {
        if (!verification.registrationInfo?.userVerified) throw userNotVerified();
      },
    },
    authentication: {
      afterVerification: async ({ verification }) => {
        if (!verification.authenticationInfo.userVerified) throw userNotVerified();
      },
    },
  };
}
