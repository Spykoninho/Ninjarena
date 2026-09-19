import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountRecord } from './accountRepository';
import { FileAccountRepository } from './fileAccountRepository';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ninjarena-accounts-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function record(name: string, rating = 100): AccountRecord {
  return { name, passwordHash: 'salt:hash', rating, wins: 0, losses: 0, createdAt: '2026-01-01' };
}

describe('FileAccountRepository', () => {
  it('starts empty without a file and finds a saved account regardless of case', async () => {
    const repository = new FileAccountRepository({ file: join(dir, 'accounts.json') });
    expect(await repository.list()).toEqual([]);

    await repository.save(record('Kage'));

    expect(await repository.get('kage')).toMatchObject({ name: 'Kage', rating: 100 });
    expect(await repository.get('hanzo')).toBeNull();
  });

  it('survives a restart and keeps the latest of two quick saves', async () => {
    const file = join(dir, 'nested', 'accounts.json');
    const first = new FileAccountRepository({ file });
    await Promise.all([first.save(record('kage', 100)), first.save(record('kage', 130))]);

    const reopened = new FileAccountRepository({ file });
    expect(await reopened.get('kage')).toMatchObject({ rating: 130 });
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      accounts: [{ name: 'kage', rating: 130 }],
    });
  });

  it('ignores an unreadable file rather than failing every login', async () => {
    const file = join(dir, 'accounts.json');
    await writeFile(file, JSON.stringify({ accounts: [{ name: 'broken' }] }), 'utf8');
    const logs: string[] = [];
    const repository = new FileAccountRepository({ file, log: (line) => logs.push(line) });

    expect(await repository.list()).toEqual([]);
    expect(logs).toHaveLength(1);
  });
});
