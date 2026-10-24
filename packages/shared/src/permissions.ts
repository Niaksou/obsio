import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access';

export const ac = createAccessControl(defaultStatements);

// Rôles du MVP : l'admin pilote l'organisation, le membre contribue.
export const roles = {
  admin: ac.newRole(ownerAc.statements),
  membre: ac.newRole(memberAc.statements),
};
