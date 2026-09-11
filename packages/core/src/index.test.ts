import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('core package', () => {
  it('exposes its name', () => {
    expect(PACKAGE_NAME).toBe('@ninjarena/core');
  });
});
