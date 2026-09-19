import type { InputBindings } from './bindings';
import { DEFAULT_BINDINGS } from './bindings';

export interface BindingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type AbilityBindings = InputBindings['abilities'];

const STORAGE_KEY = 'ninjarena.bindings';
const MOUSE_PREFIX = 'Mouse';
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

// Les touches se lisent par référence partout: l'objet ne change jamais d'identité, seul son contenu.
export class BindingsStore {
  readonly current: InputBindings;
  private readonly storage: BindingsStorage | null;
  private readonly listeners = new Set<(bindings: InputBindings) => void>();

  constructor(storage: BindingsStorage | null, defaults: InputBindings = DEFAULT_BINDINGS) {
    this.storage = storage;
    this.current = { ...defaults, abilities: [...defaults.abilities] };
    const saved = parseSavedAbilities(read(storage), defaults.abilities);
    if (saved !== null) this.current.abilities = saved;
  }

  get slotCount(): number {
    return this.current.abilities.length;
  }

  setAbility(slot: number, code: string): boolean {
    const abilities = this.current.abilities;
    if (slot < 0 || slot >= abilities.length || !isBindingCode(code)) return false;
    const previous = abilities[slot];
    // Une touche déjà prise change de place plutôt que de commander deux attaques à la fois.
    const taken = abilities.indexOf(code);
    if (taken !== -1 && taken !== slot && previous !== undefined) abilities[taken] = previous;
    abilities[slot] = code;
    this.commit();
    return true;
  }

  reset(): void {
    this.current.abilities = [...DEFAULT_BINDINGS.abilities];
    this.commit();
  }

  subscribe(listener: (bindings: InputBindings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private commit(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ abilities: this.current.abilities }));
    } catch {
      // Un stockage refusé n'empêche pas de jouer avec les touches choisies pour la session.
    }
    for (const listener of this.listeners) listener(this.current);
  }
}

export function isBindingCode(code: string): boolean {
  if (code.startsWith(MOUSE_PREFIX)) return /^Mouse[0-2]$/.test(code);
  return KEY_PATTERN.test(code) && code !== 'Escape';
}

// Une sauvegarde partielle ou corrompue ne vaut rien: on repart des touches par défaut.
export function parseSavedAbilities(
  raw: string | null,
  defaults: AbilityBindings,
): AbilityBindings | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { abilities?: unknown };
    const abilities = parsed.abilities;
    if (!Array.isArray(abilities) || abilities.length !== defaults.length) return null;
    if (!abilities.every((code) => typeof code === 'string' && isBindingCode(code))) return null;
    if (new Set(abilities).size !== abilities.length) return null;
    return [...abilities] as unknown as AbilityBindings;
  } catch {
    return null;
  }
}

function read(storage: BindingsStorage | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
