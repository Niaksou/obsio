import type { FastifyInstance, FastifyRequest } from 'fastify';
import { redactUrl } from './logging.js';

// Événements de sécurité (ASVS 16.3) : une ligne de journal par événement, reconnaissable à
// `securite: true` et au nom de l'événement. Jamais de mot de passe, de jeton ni de contenu métier.
//
// Événements : authentification (connexion, inscription, déconnexion, mot de passe, adresse
// vérifiée, invitations et membres), acces-refuse (401, 403), lien-intervention-refuse,
// limite-depassee (429), validation-refusee (400 d'un schéma).

export type SecurityEvent =
  | 'authentification'
  | 'acces-refuse'
  | 'lien-intervention-refuse'
  | 'limite-depassee'
  | 'validation-refusee';

export function logSecurityEvent(
  request: FastifyRequest,
  event: SecurityEvent,
  details: Record<string, unknown> = {},
) {
  const entry = {
    securite: true,
    evenement: event,
    ip: request.ip,
    methode: request.method,
    url: redactUrl(request.url),
    utilisateur: request.user?.id,
    organisation: request.organisation?.id,
    ...details,
  };
  request.log.warn(entry, `Sécurité : ${event}`);
}

/** Routes de Better Auth journalisées, réussite comme échec. */
const AUTH_EVENTS: Record<string, string> = {
  '/api/auth/sign-in/email': 'connexion',
  '/api/auth/sign-up/email': 'inscription',
  '/api/auth/sign-out': 'deconnexion',
  '/api/auth/request-password-reset': 'demande-reinitialisation',
  '/api/auth/reset-password': 'reinitialisation',
  '/api/auth/change-password': 'changement-mot-de-passe',
  '/api/auth/verify-email': 'verification-adresse',
  '/api/auth/revoke-session': 'fermeture-session',
  '/api/auth/revoke-sessions': 'fermeture-sessions',
  '/api/auth/revoke-other-sessions': 'fermeture-autres-sessions',
  '/api/auth/organization/invite-member': 'invitation',
  '/api/auth/organization/accept-invitation': 'acceptation-invitation',
  '/api/auth/organization/remove-member': 'retrait-membre',
  '/api/auth/organization/update-member-role': 'changement-role',
};

/** Journalise les événements déduits de la réponse ; à enregistrer avant les routes. */
export function registerSecurityLog(app: FastifyInstance) {
  app.addHook('onResponse', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    const status = reply.statusCode;
    const action =
      AUTH_EVENTS[path] ??
      (path.startsWith('/api/auth/two-factor/') ? 'double-authentification' : null);
    if (action) {
      const body = (request.body ?? {}) as Record<string, unknown>;
      logSecurityEvent(request, 'authentification', {
        action,
        resultat: status < 400 ? 'reussite' : 'echec',
        statut: status,
        // Adresse saisie : utile pour repérer un essai de mots de passe sur un compte.
        ...(typeof body.email === 'string' ? { email: body.email } : {}),
      });
    } else if (status === 401 || status === 403) {
      logSecurityEvent(request, 'acces-refuse', { statut: status });
    } else if (path.startsWith('/api/intervention/') && (status === 404 || status === 410)) {
      logSecurityEvent(request, 'lien-intervention-refuse', { statut: status });
    }
    if (status === 429) logSecurityEvent(request, 'limite-depassee', { statut: status });
  });
}
