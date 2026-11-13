import { isManager, memberRoleSchema, READ_ONLY_MESSAGES, type MemberRole } from '@obsio/shared';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import { CONSOLE_IDLE_MS, isStaff } from '../console/staff.js';
import { member, organisation, session } from '../db/schema/index.js';
import { findLicenceAccess } from '../licences/licence.js';
import type { Auth } from './auth.js';

/** Méthodes qui ne modifient rien : permises avec une licence en lecture seule (export compris). */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const MANAGERS_ONLY = 'Réservé aux administrateurs et aux responsables';

export interface SessionUser {
  id: string;
  sessionId: string;
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
  interface FastifyContextConfig {
    /**
     * Route ouverte aux collaborateurs, qui sont refusés partout ailleurs. La route vérifie
     * elle-même qu'elle ne leur montre que leurs réserves.
     */
    collaborator?: boolean;
    /**
     * Écriture permise même quand la licence est en lecture seule : émettre un dossier de
     * preuves (le client garde l'accès à ses données et à leurs preuves).
     */
    readOnlyLicence?: boolean;
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
    // Double authentification obligatoire : la session sert seulement à la configurer.
    if (!result.user.twoFactorEnabled) {
      return reply
        .code(403)
        .send({ message: 'Activez la double authentification pour continuer.' });
    }
    request.user = {
      id: result.user.id,
      sessionId: result.session.id,
      name: result.user.name,
      email: result.user.email,
      activeOrganisationId: result.session.activeOrganizationId ?? null,
    };
  }

  /**
   * Exige une organisation active dont l'utilisateur est membre. Avec une licence suspendue,
   * révoquée ou échue, seules les lectures passent (403 LICENCE_READ_ONLY sinon). Un
   * collaborateur n'entre que sur les routes marquées `config: { collaborator: true }`.
   */
  async function requireOrganisation(request: FastifyRequest, reply: FastifyReply) {
    await requireUser(request, reply);
    if (reply.sent || !request.user) return;
    const { id, activeOrganisationId } = request.user;
    const membership = activeOrganisationId
      ? await findMembership(db, id, activeOrganisationId)
      : null;
    if (!membership) return reply.code(403).send({ message: 'Aucune organisation active' });
    if (membership.role === 'collaborateur' && !request.routeOptions.config.collaborator) {
      return reply.code(403).send({ code: 'ROLE_FORBIDDEN', message: MANAGERS_ONLY });
    }
    if (!READ_METHODS.has(request.method) && !request.routeOptions.config.readOnlyLicence) {
      const licence = await findLicenceAccess(db, membership.id);
      if (licence.access === 'lecture') {
        return reply.code(403).send({
          code: 'LICENCE_READ_ONLY',
          message: READ_ONLY_MESSAGES[licence.reason!],
        });
      }
    }
    request.organisation = membership;
  }

  /** Exige un admin ou un responsable (structure, plans, rapports, réserves, électriciens). */
  async function requireManager(request: FastifyRequest, reply: FastifyReply) {
    await requireOrganisation(request, reply);
    if (reply.sent || !request.organisation) return;
    if (!isManager(request.organisation.role)) {
      return reply.code(403).send({ code: 'ROLE_FORBIDDEN', message: MANAGERS_ONLY });
    }
  }

  /**
   * Console Obsio : compte de l'équipe (404 pour les autres, la console n'existe pas pour eux)
   * et console déverrouillée par une clé d'accès depuis moins de 15 minutes d'inactivité.
   */
  async function requireStaff(request: FastifyRequest, reply: FastifyReply) {
    await requireUser(request, reply);
    if (reply.sent || !request.user) return;
    if (!(await isStaff(db, request.user.id))) {
      return reply.code(404).send({ message: 'Introuvable' });
    }
    const [unlocked] = await db
      .update(session)
      .set({ consoleUntil: new Date(Date.now() + CONSOLE_IDLE_MS) })
      .where(and(eq(session.id, request.user.sessionId), gt(session.consoleUntil, new Date())))
      .returning({ id: session.id });
    if (!unlocked) {
      return reply.code(403).send({
        code: 'CONSOLE_LOCKED',
        message: 'Console verrouillée : reconnectez-vous avec votre clé d’accès.',
      });
    }
  }

  return { requireUser, requireOrganisation, requireManager, requireStaff };
}

export type Guards = ReturnType<typeof createGuards>;
