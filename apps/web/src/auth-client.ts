import { ac, roles } from '@obsio/shared/permissions';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: `${import.meta.env.VITE_API_URL}/api/auth`,
  plugins: [organizationClient({ ac, roles })],
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
  PASSWORD_TOO_SHORT: 'Le mot de passe doit faire au moins 12 caractères.',
  INVALID_TOKEN: 'Ce lien est invalide ou a expiré.',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'Cette personne est déjà membre.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'Cette personne est déjà invitée.',
  INVITATION_NOT_FOUND: 'Invitation introuvable ou expirée.',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    'Cette invitation a été envoyée à une autre adresse que celle de votre compte.',
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
    "Vérifiez d'abord votre adresse e-mail.",
};
