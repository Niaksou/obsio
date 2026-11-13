import { z } from 'zod';

// Rôles d'une organisation :
// - admin : tout, y compris gérer toutes les personnes (sauf l'admin fondateur) ;
// - responsable : comme l'admin pour le travail (sites, rapports, réserves, électriciens),
//   mais ne gère que les collaborateurs ;
// - collaborateur : voit et traite seulement les réserves qui lui sont confiées.
// L'admin fondateur (premier admin, invité à l'ouverture du client) n'est modifiable par
// personne dans l'application.

export const MEMBER_ROLES = ['admin', 'responsable', 'collaborateur'] as const;
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Administrateur',
  responsable: 'Responsable',
  collaborateur: 'Collaborateur',
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  admin: 'Tout, y compris les personnes',
  responsable: 'Sites, rapports et réserves ; gère les collaborateurs',
  collaborateur: 'Seulement les réserves qui lui sont confiées',
};

/** Admin ou responsable : sites, rapports, réserves, électriciens, export. */
export function isManager(role: MemberRole | null | undefined): boolean {
  return role === 'admin' || role === 'responsable';
}

/** Rôles qu'un membre peut donner (invitation ou changement de rôle). */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === 'admin') return [...MEMBER_ROLES];
  if (actor === 'responsable') return ['collaborateur'];
  return [];
}

export interface PersonRef {
  role: MemberRole;
  founder?: boolean;
}

/** Un membre peut-il modifier ou retirer cette personne (membre ou invitation) ? */
export function canManagePerson(actor: MemberRole, target: PersonRef): boolean {
  if (target.founder) return false;
  return assignableRoles(actor).includes(target.role);
}
