import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access';

export const ac = createAccessControl(defaultStatements);

// Droits Better Auth sur les personnes. Qui peut agir sur qui (le responsable sur les seuls
// collaborateurs, personne sur l'admin fondateur) est vérifié en plus par l'API
// (apps/api/src/organisations/people.ts), avec les règles de ./roles.ts.
export const roles = {
  admin: ac.newRole(ownerAc.statements),
  responsable: ac.newRole({
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
  }),
  collaborateur: ac.newRole(memberAc.statements),
};
