import { APIError, type createAuthMiddleware } from 'better-auth/api';

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const MAX_LENGTH = 100;

/**
 * À l'inscription et à la modification du profil, prénom et nom vont ensemble : s'ils sont
 * fournis, les deux sont exigés et `name` devient « Prénom Nom », pour l'affichage.
 */
export function composeNameInBody(ctx: HookContext) {
  if (ctx.path !== '/sign-up/email' && ctx.path !== '/update-user') return;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (body.firstName === undefined && body.lastName === undefined) return;
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  if (!firstName || !lastName || firstName.length > MAX_LENGTH || lastName.length > MAX_LENGTH) {
    throw new APIError('BAD_REQUEST', {
      code: 'NAME_REQUIRED',
      message: 'Indiquez votre prénom et votre nom.',
    });
  }
  body.firstName = firstName;
  body.lastName = lastName;
  body.name = `${firstName} ${lastName}`;
}
