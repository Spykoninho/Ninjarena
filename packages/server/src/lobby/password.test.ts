import { describe, expect, it } from 'vitest';
import { hashPassword, passwordMatches } from './password';

describe('password', () => {
  it('accepts the password it hashed', () => {
    expect(passwordMatches(hashPassword('kunai'), 'kunai')).toBe(true);
  });

  it('rejects another password of the same length', () => {
    expect(passwordMatches(hashPassword('kunai'), 'kunaj')).toBe(false);
  });

  it('rejects a password of a different length', () => {
    expect(passwordMatches(hashPassword('kunai'), 'kunai-throw')).toBe(false);
  });

  it('hashes instead of storing the password', () => {
    const hash = hashPassword('kunai');
    expect(hash).toHaveLength(32);
    expect(hash.toString('utf8')).not.toContain('kunai');
  });
});
