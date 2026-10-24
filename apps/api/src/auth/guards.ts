import { memberRoleSchema, type MemberRole } from '@obsio/shared';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { member, organisation } from '../db/schema/index.js';
import type { Auth } from './auth.js';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  activeOrganisationId: string | null;
}

export interface Membership {
  id: string;
  name: string;
  role: MemberRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    organisation: Membership | null;
  }
}

/** Appartenance de l'utilisateur à l'organisation, lue en base (pas seulement dans la session). */
export async function findMembership(
  db: Database,
  userId: string,
  organisationId: string,
): Promise<Membership | null> {
  const [row] = await db
    .select({ id: organisation.id, name: organisation.name, role: member.role })
    .from(member)
    .innerJoin(organisation, eq(organisation.id, member.organisationId))
    .where(and(eq(member.userId, userId), eq(member.organisationId, organisationId)));
  if (!row) return null;
  return { ...row, role: memberRoleSchema.parse(row.role) };
}

export function createGuards(auth: Auth, db: Database) {
  async function requireUser(request: FastifyRequest, reply: FastifyReply) {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) return reply.code(401).send({ message: 'Authentification requise' });
    request.user = {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      activeOrganisationId: result.session.activeOrganizationId ?? null,
    };
  }

  /** Exige une organisation active dont l'utilisateur est membre. */
  async function requireOrganisation(request: FastifyRequest, reply: FastifyReply) {
    await requireUser(request, reply);
    if (reply.sent || !request.user) return;
    const { id, activeOrganisationId } = request.user;
    const membership = activeOrganisationId
      ? await findMembership(db, id, activeOrganisationId)
      : null;
    if (!membership) return reply.code(403).send({ message: 'Aucune organisation active' });
    request.organisation = membership;
  }

  /** Exige le rôle admin dans l'organisation active (modification de la structure et des plans). */
  async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    await requireOrganisation(request, reply);
    if (reply.sent || !request.organisation) return;
    if (request.organisation.role !== 'admin') {
      return reply.code(403).send({ message: 'Réservé aux administrateurs' });
    }
  }

  return { requireUser, requireOrganisation, requireAdmin };
}

export type Guards = ReturnType<typeof createGuards>;
