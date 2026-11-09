import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { haveIBeenPwned, organization } from 'better-auth/plugins';
import { ac, roles } from '@obsio/shared/permissions';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { resetPasswordEmail, verificationEmail } from '../email/templates.js';
import { INVITATION_TTL_SECONDS, sendInvitation } from '../organisations/invitations.js';
import { hasPendingInvitation } from '../organisations/signup-guard.js';
import { forbiddenWord } from './password-policy.js';

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
      },
    },
    hooks: {
      // Pas d'inscription en libre-service : il faut une invitation en attente pour cette adresse.
      before: createAuthMiddleware(async (ctx) => {
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
