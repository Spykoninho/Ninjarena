export interface AccountRecord {
  name: string;
  passwordHash: string;
  rating: number;
  wins: number;
  losses: number;
  createdAt: string;
}

// Deux pseudos qui ne diffèrent que par la casse désignent le même compte.
export function accountKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface AccountRepository {
  get(name: string): Promise<AccountRecord | null>;
  save(record: AccountRecord): Promise<void>;
  list(): Promise<AccountRecord[]>;
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, AccountRecord>();

  get(name: string): Promise<AccountRecord | null> {
    return Promise.resolve(this.accounts.get(accountKey(name)) ?? null);
  }

  save(record: AccountRecord): Promise<void> {
    this.accounts.set(accountKey(record.name), { ...record });
    return Promise.resolve();
  }

  list(): Promise<AccountRecord[]> {
    return Promise.resolve([...this.accounts.values()].map((record) => ({ ...record })));
  }
}
