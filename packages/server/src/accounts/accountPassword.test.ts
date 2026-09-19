import { describe, expect, it } from 'vitest';
import { accountPasswordMatches, hashAccountPassword } from './accountPassword';

describe('account passwords', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const stored = await hashAccountPassword('shadow-step');
    expect(await accountPasswordMatches(stored, 'shadow-step')).toBe(true);
    expect(await accountPasswordMatches(stored, 'shadow-steP')).toBe(false);
  });

  it('salts every hash so two accounts with the same password differ', async () => {
    expect(await hashAccountPassword('secret')).not.toBe(await hashAccountPassword('secret'));
  });

  it('refuses a stored value that is not a salted hash', async () => {
    expect(await accountPasswordMatches('garbage', 'secret')).toBe(false);
  });
});
