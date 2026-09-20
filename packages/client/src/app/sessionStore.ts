export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'ninjarena.session';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// Le jeton de session vit dans le navigateur: le joueur retrouve son compte sans se reconnecter.
export class SessionStore {
  private readonly storage: SessionStorageLike | null;
  private current: string | null;

  constructor(storage: SessionStorageLike | null) {
    this.storage = storage;
    this.current = read(storage);
  }

  get token(): string | null {
    return this.current;
  }

  save(token: string): void {
    if (!TOKEN_PATTERN.test(token)) return;
    this.current = token;
    try {
      this.storage?.setItem(STORAGE_KEY, token);
    } catch {
      // Un stockage refusé garde le jeton pour l'onglet: la prochaine visite redemandera le mot de passe.
    }
  }

  clear(): void {
    this.current = null;
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // Rien à faire: un stockage illisible n'a rien gardé non plus.
    }
  }
}

// Un jeton corrompu ne vaut rien: le joueur repart invité plutôt que d'envoyer n'importe quoi.
function read(storage: SessionStorageLike | null): string | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY) ?? null;
    return raw !== null && TOKEN_PATTERN.test(raw) ? raw : null;
  } catch {
    return null;
  }
}
