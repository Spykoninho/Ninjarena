import { describe, expect, it } from 'vitest';
import type { SessionStorageLike } from './sessionStore';
import { SessionStore } from './sessionStore';

const TOKEN = 'ab'.repeat(32);

class MemoryStorage implements SessionStorageLike {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

class BrokenStorage implements SessionStorageLike {
  getItem(): string | null {
    throw new Error('blocked');
  }
  setItem(): void {
    throw new Error('blocked');
  }
  removeItem(): void {
    throw new Error('blocked');
  }
}

describe('SessionStore', () => {
  it('keeps a token across store instances and forgets it on clear', () => {
    const storage = new MemoryStorage();
    new SessionStore(storage).save(TOKEN);
    expect(new SessionStore(storage).token).toBe(TOKEN);

    new SessionStore(storage).clear();
    expect(new SessionStore(storage).token).toBeNull();
  });

  it('ignores a token that is not what the server hands out', () => {
    const storage = new MemoryStorage();
    storage.setItem('ninjarena.session', 'garbage');
    const store = new SessionStore(storage);
    expect(store.token).toBeNull();
    store.save('garbage');
    expect(store.token).toBeNull();
  });

  it('still holds the token for the tab when the storage refuses everything', () => {
    const store = new SessionStore(new BrokenStorage());
    expect(store.token).toBeNull();
    store.save(TOKEN);
    expect(store.token).toBe(TOKEN);
    store.clear();
    expect(store.token).toBeNull();
  });
});
