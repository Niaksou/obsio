import { z } from 'zod';

// Notifications sur le téléphone (Web Push) : abonnement d'un appareil, tel que le donne
// PushSubscription.toJSON() dans le navigateur.

const base64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/);

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: base64url.max(200),
    auth: base64url.max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
