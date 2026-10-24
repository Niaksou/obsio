import { z } from 'zod';

export const memberRoleSchema = z.enum(['admin', 'membre']);
export type MemberRole = z.infer<typeof memberRoleSchema>;
