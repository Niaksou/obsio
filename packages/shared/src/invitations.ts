import { z } from 'zod';
import { memberRoleSchema } from './roles.js';

/** Invitation en attente, telle que l'invité connecté la voit avant de l'accepter. */
export const invitationDetailsSchema = z.object({
  id: z.uuid(),
  organisationName: z.string(),
  inviterName: z.string(),
  role: memberRoleSchema,
});
export type InvitationDetails = z.infer<typeof invitationDetailsSchema>;
