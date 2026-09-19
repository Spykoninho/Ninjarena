import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from './bindings';
import { BindingsStore, parseSavedAbilities } from './bindingsStore';
import type { BindingsStorage } from './bindingsStore';

class MemoryStorage implements BindingsStorage {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe('BindingsStore', () => {
  it('starts from the defaults and keeps the same object when a key changes', () => {
    const store = new BindingsStore(null);
    const bindings = store.current;
    expect(store.setAbility(3, 'KeyQ')).toBe(true);
    expect(store.current).toBe(bindings);
    expect(bindings.abilities).toEqual(['Mouse0', 'Space', 'Mouse2', 'KeyQ', 'KeyR']);
  });

  it('swaps a key already used by another slot instead of duplicating it', () => {
    const store = new BindingsStore(null);
    store.setAbility(4, 'KeyE');
    expect(store.current.abilities).toEqual(['Mouse0', 'Space', 'Mouse2', 'KeyR', 'KeyE']);
  });

  it('refuses Escape, unknown mouse buttons and out-of-range slots', () => {
    const store = new BindingsStore(null);
    expect(store.setAbility(0, 'Escape')).toBe(false);
    expect(store.setAbility(0, 'Mouse5')).toBe(false);
    expect(store.setAbility(5, 'KeyA')).toBe(false);
    expect(store.current.abilities).toEqual(DEFAULT_BINDINGS.abilities);
  });

  it('persists a change, notifies listeners and reloads it in a fresh store', () => {
    const storage = new MemoryStorage();
    const store = new BindingsStore(storage);
    const seen: string[][] = [];
    store.subscribe((bindings) => seen.push([...bindings.abilities]));
    store.setAbility(2, 'KeyQ');
    expect(seen).toEqual([['Mouse0', 'Space', 'KeyQ', 'KeyE', 'KeyR']]);
    expect(new BindingsStore(storage).current.abilities).toEqual([
      'Mouse0',
      'Space',
      'KeyQ',
      'KeyE',
      'KeyR',
    ]);
    store.reset();
    expect(new BindingsStore(storage).current.abilities).toEqual(DEFAULT_BINDINGS.abilities);
  });

  it('ignores a saved value that is corrupt, incomplete or duplicated', () => {
    const defaults = DEFAULT_BINDINGS.abilities;
    expect(parseSavedAbilities('not json', defaults)).toBeNull();
    expect(parseSavedAbilities('{"abilities":["KeyA"]}', defaults)).toBeNull();
    expect(
      parseSavedAbilities('{"abilities":["KeyA","KeyA","KeyB","KeyC","KeyD"]}', defaults),
    ).toBeNull();
    expect(
      parseSavedAbilities('{"abilities":["KeyA","Space","Mouse0","KeyC","KeyD"]}', defaults),
    ).toEqual(['KeyA', 'Space', 'Mouse0', 'KeyC', 'KeyD']);
  });
});
