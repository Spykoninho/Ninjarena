import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, bindingLabel, shortBindingLabel } from './bindings';

describe('bindingLabel', () => {
  it('shortens the default ability bindings to what a chip can show', () => {
    expect(DEFAULT_BINDINGS.abilities.map(bindingLabel)).toEqual([
      'Clic gauche',
      'Espace',
      'Clic droit',
      'E',
      'R',
    ]);
    expect(DEFAULT_BINDINGS.abilities.map(shortBindingLabel)).toEqual([
      'CLG',
      'ESP',
      'CLD',
      'E',
      'R',
    ]);
  });

  it('keeps a binding it has no shorter name for', () => {
    expect(bindingLabel('Tab')).toBe('Tab');
  });
});
