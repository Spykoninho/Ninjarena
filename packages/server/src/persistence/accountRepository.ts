export interface AccountRecord {
  name: string;
  passwordHash: string;
  rating: number;
  wins: number;
  losses: number;
  createdAt: string;
  // Les empreintes des jetons de session encore valables, du plus ancien au plus récent.
  sessionTokens: string[];
}

// Deux pseudos qui ne diffèrent que par la casse désignent le même compte.
export function accountKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface AccountRepository {
  get(name: string): Promise<AccountRecord | null>;
  save(record: AccountRecord): Promise<void>;
  list(): Promise<AccountRecord[]>;
  findBySessionToken(hash: string): Promise<AccountRecord | null>;
}

export function holdsSessionToken(record: AccountRecord, hash: string): boolean {
  return record.sessionTokens.includes(hash);
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, AccountRecord>();

  get(name: string): Promise<AccountRecord | null> {
    const record = this.accounts.get(accountKey(name));
    return Promise.resolve(record === undefined ? null : cloneRecord(record));
  }

  save(record: AccountRecord): Promise<void> {
    this.accounts.set(accountKey(record.name), cloneRecord(record));
    return Promise.resolve();
  }

  list(): Promise<AccountRecord[]> {
    return Promise.resolve([...this.accounts.values()].map(cloneRecord));
  }

  findBySessionToken(hash: string): Promise<AccountRecord | null> {
    for (const record of this.accounts.values()) {
      if (holdsSessionToken(record, hash)) return Promise.resolve(cloneRecord(record));
    }
    return Promise.resolve(null);
  }
}

export function cloneRecord(record: AccountRecord): AccountRecord {
  return { ...record, sessionTokens: [...record.sessionTokens] };
}
