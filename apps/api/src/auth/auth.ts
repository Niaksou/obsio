import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { organization } from 'better-auth/plugins';
import { ac, roles } from '@saas/shared/permissions';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { resetPasswordEmail, verificationEmail } from '../email/templates.js';
import { INVITATION_TTL_SECONDS, sendInvitation } from '../organisations/invitations.js';
import { hasPendingInvitation } from '../organisations/signup-guard.js';

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
    advanced: { database: { generateId: 'uuid' } },
    hooks: {
      // Pas d'inscription en libre-service : il faut une invitation en attente pour cette adresse.
      before: createAuthMiddleware(async (ctx) => {
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
