import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MapDocument } from '@ninjarena/core';
import { FileMapRepository } from './fileMapRepository';

function makeDocument(id: string, name: string): MapDocument {
  const row = new Array<number>(8).fill(0);
  return {
    version: 1,
    id,
    name,
    tileset: 'default',
    width: 8,
    height: 8,
    layers: {
      ground: Array.from({ length: 8 }, () => [...row]),
      objects: Array.from({ length: 8 }, () => new Array<number | null>(8).fill(null)),
    },
    colliders: [],
    spawns: [{ x: 1, y: 1 }],
  };
}

describe('FileMapRepository', () => {
  let dir: string;
  let logs: string[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ninjarena-maps-'));
    logs = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves and lists documents', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));
    await repository.save(makeDocument('two', 'Two'));

    const docs = await repository.list();
    expect(docs.map((doc) => doc.id).sort()).toEqual(['one', 'two']);
  });

  it('returns null for a missing id', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await expect(repository.get('missing')).resolves.toBeNull();
  });

  it('gets a saved document by id', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));

    await expect(repository.get('one')).resolves.toEqual(makeDocument('one', 'One'));
  });

  it('deletes a saved document and reports a missing one', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));

    await expect(repository.delete('one')).resolves.toBe(true);
    await expect(repository.get('one')).resolves.toBeNull();
    await expect(readdir(dir)).resolves.toEqual([]);
    await expect(repository.delete('one')).resolves.toBe(false);
  });

  it('skips and logs a corrupt file', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));
    await writeFile(join(dir, 'bad.json'), '{ not valid json', 'utf8');

    const docs = await repository.list();
    expect(docs.map((doc) => doc.id)).toEqual(['one']);
    expect(logs).toEqual([expect.stringMatching(/^skipping map file bad\.json: .+$/)]);
  });

  it('skips and logs a file that is valid JSON but not a valid map document', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));
    await writeFile(join(dir, 'bad.json'), JSON.stringify({ version: 1, id: 'bad' }), 'utf8');

    const docs = await repository.list();
    expect(docs.map((doc) => doc.id)).toEqual(['one']);
    expect(logs).toEqual([expect.stringContaining('skipping map file bad.json:')]);
    await expect(repository.get('bad')).resolves.toBeNull();
  });

  it('keeps a single file when overwriting', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));
    await repository.save(makeDocument('one', 'One renamed'));

    const files = await readdir(dir);
    expect(files).toEqual(['one.json']);
    await expect(repository.get('one')).resolves.toMatchObject({ name: 'One renamed' });
  });

  it('counts only the files that parse', async () => {
    const repository = new FileMapRepository({ dir, log: (line) => logs.push(line) });
    await repository.save(makeDocument('one', 'One'));
    await repository.save(makeDocument('two', 'Two'));
    await writeFile(join(dir, 'bad.json'), '{ not valid json', 'utf8');

    await expect(repository.count()).resolves.toBe(2);
  });

  it('starts empty when the directory does not exist yet', async () => {
    const repository = new FileMapRepository({
      dir: join(dir, 'nested'),
      log: (line) => logs.push(line),
    });

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
  });

  it('creates the directory on first save', async () => {
    const nested = join(dir, 'nested');
    const repository = new FileMapRepository({ dir: nested, log: (line) => logs.push(line) });

    await repository.save(makeDocument('one', 'One'));

    const files = await readdir(nested);
    expect(files).toEqual(['one.json']);
  });
});
