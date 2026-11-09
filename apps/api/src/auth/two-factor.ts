import { APIError, getSessionFromCtx, type createAuthMiddleware } from 'better-auth/api';

// Double authentification obligatoire pour tous les comptes (ASVS 6.3.3) : TOTP par une
// application d'authentification, codes de secours à usage unique. Les intervenants, qui
// passent par un lien sans compte, ne sont pas concernés.

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Routes ouvertes à une session sans double authentification : se connecter, se déconnecter,
 * vérifier son adresse, réinitialiser son mot de passe et configurer la double authentification.
 * Toute autre route de Better Auth (organisation, invitations, sessions, mot de passe) l'exige.
 */
const ALLOWED_WITHOUT_TWO_FACTOR = new Set([
  '/sign-in/email',
  '/sign-up/email',
  '/sign-out',
  '/get-session',
  '/verify-email',
  '/send-verification-email',
  '/request-password-reset',
  '/reset-password',
  '/reset-password/:token',
]);

/** Un code TOTP reste valable 90 secondes (une période de part et d'autre) : on le retient 2 min. */
const USED_CODE_TTL_MS = 2 * 60 * 1000;

const usedCodeIdentifier = (userId: string, code: string) => `totp-utilise-${userId}-${code}`;

/** Utilisateur qui vérifie un code : session en cours, ou connexion en attente du code. */
async function verifyingUserId(ctx: HookContext) {
  const current = await getSessionFromCtx(ctx);
  if (current) return current.user.id;
  const cookie = ctx.context.createAuthCookie('two_factor');
  const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!identifier) return null;
  const pending = await ctx.context.internalAdapter.findVerificationValue(identifier);
  return pending?.value ?? null;
}

const codeOf = (ctx: HookContext) => {
  const code = (ctx.body as Record<string, unknown> | undefined)?.code;
  return typeof code === 'string' ? code : null;
};

/** Avant chaque route de Better Auth. */
export async function enforceTwoFactor(ctx: HookContext) {
  // Ni désactivation, ni appareil de confiance qui dispenserait du code pendant 30 jours.
  if (ctx.path === '/two-factor/disable') {
    throw new APIError('FORBIDDEN', {
      code: 'TWO_FACTOR_MANDATORY',
      message: 'La double authentification est obligatoire.',
    });
  }
  if (ctx.path.startsWith('/two-factor/')) {
    if ((ctx.body as Record<string, unknown> | undefined)?.trustDevice) {
      throw new APIError('BAD_REQUEST', {
        code: 'TRUST_DEVICE_DISABLED',
        message: 'La mémorisation de cet appareil n’est pas proposée.',
      });
    }
    // Un code TOTP ne sert qu'une fois (ASVS 6.5.1), même dans sa période de validité.
    const code = codeOf(ctx);
    if (ctx.path === '/two-factor/verify-totp' && code) {
      const userId = await verifyingUserId(ctx);
      const used =
        userId &&
        (await ctx.context.internalAdapter.findVerificationValue(usedCodeIdentifier(userId, code)));
      if (used && used.expiresAt > new Date()) {
        throw new APIError('UNAUTHORIZED', { code: 'INVALID_CODE', message: 'Invalid code' });
      }
    }
    return;
  }
  if (ALLOWED_WITHOUT_TWO_FACTOR.has(ctx.path)) return;
  const current = await getSessionFromCtx(ctx);
  if (current && !current.user.twoFactorEnabled) {
    throw new APIError('FORBIDDEN', {
      code: 'TWO_FACTOR_REQUIRED',
      message: 'Activez la double authentification pour continuer.',
    });
  }
}

/** Après chaque route de Better Auth : retient le code TOTP accepté. */
export async function rememberUsedCode(ctx: HookContext) {
  const code = codeOf(ctx);
  const accepted = ctx.context.newSession;
  if (ctx.path !== '/two-factor/verify-totp' || !code || !accepted) return;
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: usedCodeIdentifier(accepted.user.id, code),
    value: accepted.user.id,
    expiresAt: new Date(Date.now() + USED_CODE_TTL_MS),
  });
}
