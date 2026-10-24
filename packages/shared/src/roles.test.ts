import { describe, expect, it } from 'vitest';
import { memberRoleSchema } from './roles.js';

describe('memberRoleSchema', () => {
  it('accepte les rôles du MVP', () => {
    expect(memberRoleSchema.parse('admin')).toBe('admin');
    expect(memberRoleSchema.parse('membre')).toBe('membre');
  });

  it('refuse un rôle inconnu', () => {
    expect(memberRoleSchema.safeParse('owner').success).toBe(false);
  });
});
