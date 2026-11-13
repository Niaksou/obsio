import { assignableRoles, canManagePerson, memberRoleSchema, type MemberRole } from '@obsio/shared';
import { and, eq, or } from 'drizzle-orm';
import { APIError, getSessionFromCtx, type createAuthMiddleware } from 'better-auth/api';
import type { Database } from '../db/client.js';
import { invitation, member, user } from '../db/schema/index.js';

// Qui peut agir sur qui (règles dans @obsio/shared/roles) : vérifié avant les routes de
// Better Auth qui touchent aux personnes, dont les hooks ne disent pas qui agit.
//   - l'admin agit sur tout le monde, sauf l'admin fondateur ;
//   - le responsable invite, modifie et retire les seuls collaborateurs ;
//   - le collaborateur n'agit sur personne ;
//   - l'admin fondateur ne quitte pas l'organisation et ne change pas de rôle.

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

export const PEOPLE_PATHS = new Set([
  '/organization/invite-member',
  '/organization/update-member-role',
  '/organization/remove-member',
  '/organization/cancel-invitation',
  '/organization/leave',
]);

function refuse(message: string): never {
  throw new APIError('FORBIDDEN', { code: 'PEOPLE_FORBIDDEN', message });
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);

async function membership(db: Database, userId: string, organisationId: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role, founder: member.founder })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organisationId, organisationId)));
  if (!row) return null;
  const role = memberRoleSchema.safeParse(row.role);
  return role.success ? { ...row, role: role.data } : null;
}

/** Membre visé par son identifiant ou son adresse e-mail, dans l'organisation. */
async function targetMember(db: Database, organisationId: string, idOrEmail: string) {
  const [row] = await db
    .select({ id: member.id, role: member.role, founder: member.founder })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organisationId, organisationId),
        /^[0-9a-f-]{36}$/i.test(idOrEmail)
          ? or(eq(member.id, idOrEmail), eq(user.email, idOrEmail))
          : eq(user.email, idOrEmail.trim().toLowerCase()),
      ),
    );
  return row ?? null;
}

const asRole = (value: unknown): MemberRole | null => {
  const parsed = memberRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export async function guardPeopleAction(db: Database, ctx: HookContext) {
  if (!PEOPLE_PATHS.has(ctx.path)) return;
  const current = await getSessionFromCtx(ctx);
  // Sans session, Better Auth répond lui-même 401.
  if (!current) return;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const organisationId = text(body.organizationId) ?? current.session.activeOrganizationId ?? null;
  if (!organisationId) return;
  const actor = await membership(db, current.user.id, organisationId);
  if (!actor) return;

  switch (ctx.path) {
    case '/organization/invite-member': {
      const role = asRole(body.role);
      if (!role) refuse('Rôle inconnu.');
      if (!assignableRoles(actor.role).includes(role)) {
        refuse(
          actor.role === 'responsable'
            ? 'Un responsable invite seulement des collaborateurs.'
            : 'Vous ne pouvez pas inviter de personnes.',
        );
      }
      return;
    }
    case '/organization/update-member-role': {
      const target = await targetMember(db, organisationId, text(body.memberId) ?? '');
      const role = asRole(body.role);
      if (!target || !role) return;
      const targetRole = asRole(target.role);
      if (target.founder) refuse('Le rôle de l’admin fondateur ne change pas.');
      if (!targetRole || !canManagePerson(actor.role, { role: targetRole })) {
        refuse('Vous ne pouvez pas modifier cette personne.');
      }
      if (!assignableRoles(actor.role).includes(role)) refuse('Vous ne pouvez pas donner ce rôle.');
      return;
    }
    case '/organization/remove-member': {
      const target = await targetMember(db, organisationId, text(body.memberIdOrEmail) ?? '');
      if (!target) return;
      const targetRole = asRole(target.role);
      if (target.founder) refuse('L’admin fondateur ne peut pas être retiré.');
      if (!targetRole || !canManagePerson(actor.role, { role: targetRole })) {
        refuse('Vous ne pouvez pas retirer cette personne.');
      }
      return;
    }
    case '/organization/cancel-invitation': {
      const [found] = await db
        .select({ role: invitation.role })
        .from(invitation)
        .where(
          and(
            eq(invitation.id, text(body.invitationId) ?? ''),
            eq(invitation.organisationId, organisationId),
          ),
        );
      const role = asRole(found?.role);
      if (role && !canManagePerson(actor.role, { role })) {
        refuse('Vous ne pouvez pas annuler cette invitation.');
      }
      return;
    }
    case '/organization/leave':
      if (actor.founder) refuse('L’admin fondateur ne peut pas quitter l’organisation.');
      return;
  }
}

/**
 * À l'acceptation d'une invitation : le premier admin d'une organisation sans fondateur
 * le devient (l'admin invité à l'ouverture du client).
 */
export async function markFounder(db: Database, memberId: string, organisationId: string) {
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organisationId, organisationId), eq(member.founder, true)));
  if (existing) return;
  await db
    .update(member)
    .set({ founder: true })
    .where(and(eq(member.id, memberId), eq(member.role, 'admin')));
}
