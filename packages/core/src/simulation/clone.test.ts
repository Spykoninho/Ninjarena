import { describe, expect, it } from 'vitest';
import { clonePlain } from './clone';

describe('clonePlain', () => {
  it('does not let a JSON "__proto__" key re-parent the copy', () => {
    const copy = clonePlain(JSON.parse('{"__proto__": { "polluted": true }}') as object);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
  });
});
