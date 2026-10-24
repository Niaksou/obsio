import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { invitationEmail, resetPasswordEmail, verificationEmail } from '../email/templates.js';
import { ac, roles } from './permissions.js';

const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

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
        disableOrganizationDeletion: true,
        requireEmailVerificationOnInvitation: true,
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        sendInvitationEmail: async ({ id, email, organization, inviter }) => {
          const url = `${config.WEB_URL}/invitations/${id}`;
          await emailSender.send(
            invitationEmail(email, {
              inviterName: inviter.user.name,
              organisationName: organization.name,
              url,
            }),
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
