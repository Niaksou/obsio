import { describe, expect, it } from 'vitest';
import { assignableRoles, canManagePerson, isManager } from './roles.js';

describe('rôles', () => {
  it('l’admin gère tout le monde sauf le fondateur', () => {
    expect(canManagePerson('admin', { role: 'admin' })).toBe(true);
    expect(canManagePerson('admin', { role: 'responsable' })).toBe(true);
    expect(canManagePerson('admin', { role: 'admin', founder: true })).toBe(false);
    expect(assignableRoles('admin')).toEqual(['admin', 'responsable', 'collaborateur']);
  });

  it('le responsable ne gère que les collaborateurs', () => {
    expect(canManagePerson('responsable', { role: 'collaborateur' })).toBe(true);
    expect(canManagePerson('responsable', { role: 'responsable' })).toBe(false);
    expect(canManagePerson('responsable', { role: 'admin' })).toBe(false);
    expect(assignableRoles('responsable')).toEqual(['collaborateur']);
  });

  it('le collaborateur ne gère personne et ne voit que ses réserves', () => {
    expect(canManagePerson('collaborateur', { role: 'collaborateur' })).toBe(false);
    expect(assignableRoles('collaborateur')).toEqual([]);
    expect(isManager('collaborateur')).toBe(false);
    expect(isManager('responsable')).toBe(true);
  });
});
