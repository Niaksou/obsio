import { describe, expect, it } from 'vitest';
import { pagePattern } from './usage.js';

describe('pages vues', () => {
  it('remplace les identifiants et ne compte que les pages connues', () => {
    expect(pagePattern('/')).toBe('/');
    expect(pagePattern('/etages/36c354b7-a47f-4701-aa16-9d36a3929578')).toBe('/etages/:id');
    expect(pagePattern('/sites/36c354b7-a47f-4701-aa16-9d36a3929578/reserves/')).toBe(
      '/sites/:id/reserves',
    );
    expect(pagePattern('/console')).toBeNull();
    expect(pagePattern('/intervention/jeton-secret')).toBeNull();
    expect(pagePattern('/etages/pas-un-uuid')).toBeNull();
  });
});
