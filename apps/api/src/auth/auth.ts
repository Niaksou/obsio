import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { haveIBeenPwned, organization, twoFactor } from 'better-auth/plugins';
import { ac, roles } from '@obsio/shared/permissions';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { resetPasswordEmail, verificationEmail } from '../email/templates.js';
import { endCollaboratorAssignments } from '../reserves/collaborators.js';
import { INVITATION_TTL_SECONDS, sendInvitation } from '../organisations/invitations.js';
import { hasPendingInvitation } from '../organisations/signup-guard.js';
import { composeNameInBody } from './names.js';
import { passkeyOptions } from './passkey.js';
import { forbiddenWord } from './password-policy.js';
import {
  backupCodeOptions,
  enforceTwoFactor,
  hashBackupCodeInBody,
  rememberUsedCode,
} from './two-factor.js';

/** Routes qui fixent un mot de passe : liste des mots interdits et mots de passe divulgués. */
const PASSWORD_PATHS = ['/sign-up/email', '/reset-password', '/change-password'];

export interface AuthDependencies {
  config: ApiConfig;
  db: Database;
  emailSender: EmailSender;
}

export function createAuth({ config, db, emailSender }: AuthDependencies) {
  return betterAuth({
    baseURL: config.API_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.WEB_URL],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    advanced: {
      database: { generateId: 'uuid' },
      // En HTTPS, cookies préfixés `__Host-` (ASVS 3.3.3) : Secure, Path=/ et sans Domain, donc
      // ni posés ni écrasés par un sous-domaine. Better Auth ne propose que `__Secure-` : on
      // coupe son préfixe et on impose Secure. En HTTP (développement), noms ordinaires.
      ...(config.API_URL.startsWith('https://')
        ? {
            useSecureCookies: false,
            cookiePrefix: '__Host-obsio',
            defaultCookieAttributes: { secure: true },
          }
        : {}),
      // Les proxys (Caddy) sont sur le réseau interne : l'adresse du client est la dernière de
      // X-Forwarded-For qui n'en fait pas partie. Sans cela, la limitation ci-dessous serait
      // commune à tous les utilisateurs.
      ipAddress: {
        trustedProxies: [
          '10.0.0.0/8',
          '172.16.0.0/12',
          '192.168.0.0/16',
          '127.0.0.0/8',
          '::1/128',
          'fc00::/7',
        ],
      },
    },
    // Actif en production seulement (réglage par défaut) ; par adresse IP du client.
    // Routes sensibles plus strictes : deviner un mot de passe ou inonder une boîte de réception.
    rateLimit: {
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 300, max: 10 },
        '/sign-up/email': { window: 3600, max: 5 },
        '/request-password-reset': { window: 3600, max: 5 },
        '/send-verification-email': { window: 3600, max: 5 },
        '/reset-password': { window: 3600, max: 10 },
        '/passkey/verify-authentication': { window: 300, max: 10 },
      },
    },
    hooks: {
      // Double authentification obligatoire (two-factor.ts), mots de passe trop faciles refusés,
      // pas d'inscription en libre-service : il faut une invitation en attente pour l'adresse.
      before: createAuthMiddleware(async (ctx) => {
        await enforceTwoFactor(ctx);
        hashBackupCodeInBody(ctx);
        composeNameInBody(ctx);
        if (PASSWORD_PATHS.includes(ctx.path)) {
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          const password = body.password ?? body.newPassword;
          const personal = [body.email, body.name].map((v) =>
            typeof v === 'string' ? v : undefined,
          );
          const word = typeof password === 'string' ? forbiddenWord(password, personal) : null;
          if (word) {
            throw new APIError('BAD_REQUEST', {
              code: 'PASSWORD_TOO_GUESSABLE',
              message: `Choisissez un mot de passe qui ne contient pas « ${word} ».`,
            });
          }
        }
        if (ctx.path !== '/sign-up/email') return;
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        if (!(await hasPendingInvitation(db, email))) {
          throw new APIError('FORBIDDEN', {
            code: 'SIGNUP_REQUIRES_INVITATION',
            message: "L'inscription se fait uniquement sur invitation.",
          });
        }
      }),
      after: createAuthMiddleware(rememberUsedCode),
    },
    // Reconnexion après 2 heures sans activité (prolongée au plus toutes les 5 minutes d'usage) ;
    // durée maximale de 12 heures fixée par la base (migration 0007_session_lifetime).
    session: {
      expiresIn: 2 * 3600,
      updateAge: 5 * 60,
    },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false, input: true },
        lastName: { type: 'string', required: false, input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await emailSender.send(resetPasswordEmail(user.email, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailSender.send(verificationEmail(user.email, url));
      },
    },
    plugins: [
      // TOTP (application d'authentification), secret chiffré en base, et 10 codes de secours à
      // usage unique, hachés ; compte verrouillé 15 minutes après 10 codes faux de suite.
      twoFactor({ issuer: 'Obsio', backupCodeOptions }),
      // Connexion par passkey (Face ID, empreinte, clé de sécurité), ajoutée depuis une session
      // déjà protégée par la double authentification. L'appareil et la vérification de
      // l'utilisateur (biométrie ou code de l'appareil) font deux facteurs résistants au
      // hameçonnage (ASVS 6.6) : la connexion par passkey dispense du mot de passe et du TOTP.
      passkey(passkeyOptions(config)),
      // Mot de passe connu des fuites de données refusé (ASVS 6.2.4, 6.2.12) : seuls les 5
      // premiers caractères de son empreinte SHA-1 partent vers api.pwnedpasswords.com. Coupé
      // dans les tests (pas d'appel réseau), sauf s'ils l'activent explicitement.
      haveIBeenPwned({
        enabled: config.PASSWORD_BREACH_CHECK ?? config.NODE_ENV !== 'test',
        customPasswordCompromisedMessage:
          'Ce mot de passe figure dans des fuites de données connues : choisissez-en un autre.',
      }),
      organization({
        ac,
        roles,
        creatorRole: 'admin',
        // Les organisations sont créées par provisionOrganisation (commande org:create).
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        requireEmailVerificationOnInvitation: true,
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        organizationHooks: {
          // Un membre retiré est déconnecté partout (ASVS 7.4.5) : son accès à l'organisation
          // est déjà coupé, mais une session ouverte ne doit pas survivre au retrait.
          // Ses réserves en cours ne lui sont plus confiées.
          afterRemoveMember: async ({ user, organization }) => {
            await db.delete(schema.session).where(eq(schema.session.userId, user.id));
            await endCollaboratorAssignments(db, organization.id, user.id);
          },
        },
        sendInvitationEmail: async ({ id, email, organization, inviter }) => {
          await sendInvitation(
            { config, emailSender },
            { id, email, inviterName: inviter.user.name, organisationName: organization.name },
          );
        },
        schema: {
          organization: { modelName: 'organisation' },
          member: { fields: { organizationId: 'organisationId' } },
          invitation: { fields: { organizationId: 'organisationId' } },
          session: { fields: { activeOrganizationId: 'activeOrganisationId' } },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
