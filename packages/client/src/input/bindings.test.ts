import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, bindingLabel } from './bindings';

describe('bindingLabel', () => {
  it('shortens the default ability bindings to what a chip can show', () => {
    expect(DEFAULT_BINDINGS.abilities.map(bindingLabel)).toEqual(['LMB', 'SPC', 'RMB', 'E', 'R']);
  });

  it('keeps a binding it has no shorter name for', () => {
    expect(bindingLabel('Tab')).toBe('Tab');
  });
});
