import type { ApiConfig } from '../config.js';
import type { EmailSender } from '../email/sender.js';
import { invitationEmail } from '../email/templates.js';

export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function sendInvitation(
  { config, emailSender }: { config: Pick<ApiConfig, 'WEB_URL'>; emailSender: EmailSender },
  invitation: { id: string; email: string; inviterName: string; organisationName: string },
): Promise<void> {
  await emailSender.send(
    invitationEmail(invitation.email, {
      inviterName: invitation.inviterName,
      organisationName: invitation.organisationName,
      url: `${config.WEB_URL}/invitations/${invitation.id}`,
    }),
  );
}
