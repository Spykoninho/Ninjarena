import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { AccountRecord, AccountRepository } from './accountRepository';
import { accountKey } from './accountRepository';

export interface FileAccountRepositoryOptions {
  file: string;
  log?: (line: string) => void;
}

const AccountRecordSchema = z.object({
  name: z.string().min(1),
  passwordHash: z.string().min(1),
  rating: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  createdAt: z.string(),
});

const AccountFileSchema = z.object({ accounts: z.array(AccountRecordSchema) });

// Tous les comptes tiennent dans un fichier JSON relu une fois puis réécrit en entier à chaque sauvegarde.
export class FileAccountRepository implements AccountRepository {
  private readonly file: string;
  private readonly log: (line: string) => void;
  private accounts: Map<string, AccountRecord> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(options: FileAccountRepositoryOptions) {
    this.file = options.file;
    this.log = options.log ?? (() => {});
  }

  async get(name: string): Promise<AccountRecord | null> {
    const accounts = await this.load();
    const record = accounts.get(accountKey(name));
    return record === undefined ? null : { ...record };
  }

  async save(record: AccountRecord): Promise<void> {
    const accounts = await this.load();
    accounts.set(accountKey(record.name), { ...record });
    // Les écritures s'enchaînent: deux sauvegardes rapprochées ne se disputent pas le fichier temporaire.
    this.writing = this.writing.then(() => this.persist([...accounts.values()]));
    await this.writing;
  }

  async list(): Promise<AccountRecord[]> {
    const accounts = await this.load();
    return [...accounts.values()].map((record) => ({ ...record }));
  }

  private async load(): Promise<Map<string, AccountRecord>> {
    if (this.accounts !== null) return this.accounts;
    const accounts = new Map<string, AccountRecord>();
    for (const record of await this.readAll()) accounts.set(accountKey(record.name), record);
    this.accounts = accounts;
    return accounts;
  }

  private async readAll(): Promise<AccountRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const parsed = AccountFileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data.accounts;
    // Un fichier corrompu ne doit pas empêcher le serveur de démarrer: il repart sans compte et le dit.
    this.log(`ignoring unreadable account file ${this.file}`);
    return [];
  }

  private async persist(records: AccountRecord[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify({ accounts: records }, null, 2), 'utf8');
    await rename(temp, this.file);
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
