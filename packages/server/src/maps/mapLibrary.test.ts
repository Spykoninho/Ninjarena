import { describe, expect, it } from 'vitest';
import type { MapDocument } from '@ninjarena/core';
import { loadContent } from '@ninjarena/content';
import { InMemoryMapRepository } from '../persistence/mapRepository';
import { MapLibrary } from './mapLibrary';

const content = loadContent();

function tinyMap(overrides: Partial<MapDocument> = {}): unknown {
  const size = 8;
  return {
    version: 1,
    id: 'tiny',
    name: 'Tiny',
    tileset: 'default',
    width: size,
    height: size,
    layers: {
      ground: Array.from({ length: size }, () => new Array<number>(size).fill(0)),
      objects: Array.from({ length: size }, () => new Array<number | null>(size).fill(null)),
    },
    colliders: [],
    spawns: [{ x: 1, y: 1 }],
    ...overrides,
  };
}

describe('MapLibrary', () => {
  it('lists the bundled arena map as builtin', async () => {
    const library = new MapLibrary({
      content,
      repository: new InMemoryMapRepository(),
      maxStoredMaps: 10,
    });

    const summaries = await library.list();
    expect(summaries).toContainEqual(
      expect.objectContaining({ id: 'arena', name: 'Arène', builtin: true }),
    );
  });

  it('assigns a fresh id and stamps author and createdAt on save', async () => {
    const library = new MapLibrary({
      content,
      repository: new InMemoryMapRepository(),
      maxStoredMaps: 10,
      random: () => 0,
    });

    const result = await library.save(tinyMap(), 'kunoichi');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected save to succeed');
    expect(result.id).toMatch(/^tiny-[a-z0-9]{4}$/);

    const saved = await library.get(result.id);
    expect(saved).toMatchObject({ author: 'kunoichi' });
    expect(saved?.createdAt).toEqual(expect.any(String));
  });

  it('lists a stored map alongside builtins, sorted within each group', async () => {
    const repository = new InMemoryMapRepository();
    const library = new MapLibrary({ content, repository, maxStoredMaps: 10, random: () => 0 });

    await library.save(tinyMap({ name: 'Aardvark' }), 'kunoichi');
    const summaries = await library.list();

    expect(summaries.map((summary) => summary.builtin)).toEqual([true, true, false]);
    expect(summaries[2]).toMatchObject({ name: 'Aardvark', builtin: false });
  });

  it('refuses to save a document under a built-in id', async () => {
    const library = new MapLibrary({
      content,
      repository: new InMemoryMapRepository(),
      maxStoredMaps: 10,
    });

    const result = await library.save(tinyMap({ id: 'arena', name: 'Arena' }), 'kunoichi');
    expect(result).toEqual({
      ok: false,
      code: 'INVALID_MAP',
      message: '"arena" is a built-in map',
    });
  });

  it('refuses to save a document with a spawn on a wall', async () => {
    const size = 8;
    const objects = Array.from({ length: size }, () => new Array<number | null>(size).fill(null));
    objects[1]![1] = 3; // 3 = wall dans le tileset "default"
    const document = tinyMap({
      layers: {
        ground: Array.from({ length: size }, () => new Array<number>(size).fill(0)),
        objects,
      },
    });

    const library = new MapLibrary({
      content,
      repository: new InMemoryMapRepository(),
      maxStoredMaps: 10,
    });

    const result = await library.save(document, 'kunoichi');
    expect(result).toEqual({
      ok: false,
      code: 'INVALID_MAP',
      message: 'apparition en (1, 1) sur une tuile solide',
    });
  });

  it('caps new stored maps but still allows overwriting an existing one', async () => {
    const repository = new InMemoryMapRepository();
    const library = new MapLibrary({ content, repository, maxStoredMaps: 1, random: () => 0 });

    const first = await library.save(tinyMap({ name: 'First' }), 'kunoichi');
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected save to succeed');

    const second = await library.save(tinyMap({ name: 'Second' }), 'kunoichi');
    expect(second).toMatchObject({ ok: false, code: 'MAP_STORE_FULL' });

    const overwrite = await library.save(
      tinyMap({ id: first.id, name: 'First renamed' }),
      'kunoichi',
    );
    expect(overwrite).toEqual({ ok: true, id: first.id });

    const stored = await repository.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'First renamed' });
  });

  it('keeps the original createdAt when overwriting an existing stored map', async () => {
    const repository = new InMemoryMapRepository();
    // Deux dates bien distinctes: si `save` retimbrait à l'écrasement, le test le verrait.
    const dates = [new Date('2020-01-01T00:00:00.000Z'), new Date('2024-06-15T12:00:00.000Z')];
    let call = 0;
    const now = (): Date => dates[call++] ?? dates[dates.length - 1]!;
    const library = new MapLibrary({
      content,
      repository,
      maxStoredMaps: 10,
      random: () => 0,
      now,
    });

    const first = await library.save(tinyMap({ name: 'First' }), 'kunoichi');
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected save to succeed');
    const original = await repository.get(first.id);
    expect(original?.createdAt).toBe(dates[0]!.toISOString());

    const overwrite = await library.save(
      tinyMap({ id: first.id, name: 'First renamed' }),
      'kunoichi',
    );
    expect(overwrite).toEqual({ ok: true, id: first.id });

    const updated = await repository.get(first.id);
    expect(updated?.createdAt).toBe(dates[0]!.toISOString());
    expect(updated?.createdAt).not.toBe(dates[1]!.toISOString());
    expect(updated?.name).toBe('First renamed');
  });
});
