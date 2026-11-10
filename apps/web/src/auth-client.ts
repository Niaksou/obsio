import { ac, roles } from '@obsio/shared/permissions';
import {
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: `${import.meta.env.VITE_API_URL}/api/auth`,
  plugins: [
    organizationClient({ ac, roles }),
    twoFactorClient(),
    inferAdditionalFields({
      user: {
        firstName: { type: 'string', required: false },
        lastName: { type: 'string', required: false },
      },
    }),
  ],
});

/** Message d'erreur affichable à partir d'une réponse d'erreur de Better Auth. */
export function errorMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  return ERROR_MESSAGES[error.code ?? ''] ?? 'Une erreur est survenue. Réessayez.';
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Adresse e-mail ou mot de passe incorrect.',
  EMAIL_NOT_VERIFIED: 'Adresse e-mail non vérifiée : cliquez sur le lien reçu par e-mail.',
  SIGNUP_REQUIRES_INVITATION:
    "Aucune invitation en attente pour cette adresse : utilisez celle qui a reçu l'invitation.",
  USER_ALREADY_EXISTS: 'Un compte existe déjà avec cette adresse : connectez-vous.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Un compte existe déjà avec cette adresse.',
  NAME_REQUIRED: 'Indiquez votre prénom et votre nom.',
  PASSWORD_MISMATCH: 'Les deux mots de passe ne correspondent pas.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit faire au moins 12 caractères.',
  INVALID_TOKEN: 'Ce lien est invalide ou a expiré.',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'Cette personne est déjà membre.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'Cette personne est déjà invitée.',
  INVITATION_NOT_FOUND: 'Invitation introuvable ou expirée.',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    'Cette invitation a été envoyée à une autre adresse que celle de votre compte.',
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
    "Vérifiez d'abord votre adresse e-mail.",
  INVALID_PASSWORD: 'Mot de passe incorrect.',
  INVALID_CODE: 'Code incorrect ou déjà utilisé : attendez le suivant.',
  INVALID_BACKUP_CODE: 'Code de secours incorrect ou déjà utilisé.',
  INVALID_TWO_FACTOR_COOKIE: 'Délai dépassé : reconnectez-vous.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Trop de codes incorrects : reconnectez-vous.',
  ACCOUNT_TEMPORARILY_LOCKED:
    'Trop de codes incorrects : compte bloqué 15 minutes. Réessayez plus tard.',
  TWO_FACTOR_REQUIRED: 'Activez la double authentification pour continuer.',
};
