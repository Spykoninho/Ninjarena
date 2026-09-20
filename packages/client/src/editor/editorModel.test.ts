import { loadContent } from '@ninjarena/content';
import { MAP_MAX_SPAWNS } from '@ninjarena/core';
import { describe, expect, it } from 'vitest';
import type { EditorState } from './editorModel';
import {
  applyTool,
  fillTileId,
  loadDocument,
  newMapDocument,
  paletteOf,
  removeAt,
  renameDocument,
  selectTool,
  withDocumentId,
  withIssues,
} from './editorModel';
import { parseMapFile, serializeMap } from './mapFile';

const tileset = loadContent().tilesets.get('default');

const GROUND = 0;
const GRASS = 1;
const WALL = 3;

function draft(): EditorState {
  return loadDocument(newMapDocument('Test', 8, 8, tileset));
}

describe('newMapDocument', () => {
  it('fills the ground with the fill tile and leaves the object layer empty', () => {
    const document = newMapDocument('Test', 8, 8, tileset);
    expect(document.version).toBe(1);
    expect(document.id).toBe('draft');
    expect(document.name).toBe('Test');
    expect(document.tileset).toBe('default');
    expect(document.layers.ground).toEqual(
      Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => GROUND)),
    );
    expect(document.layers.objects).toEqual(
      Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
    );
    expect(document.spawns).toEqual([]);
  });

  it('clamps the size to the format bounds', () => {
    const document = newMapDocument('Test', 2, 999, tileset);
    expect(document.width).toBe(8);
    expect(document.height).toBe(128);
  });
});

describe('fillTileId', () => {
  it('picks the lowest non solid ground tile', () => {
    expect(fillTileId(tileset)).toBe(GROUND);
  });
});

describe('paletteOf', () => {
  it('lists every tile sorted by id with its layer and category', () => {
    const palette = paletteOf(tileset);
    expect(palette).toHaveLength(Object.keys(tileset.tiles).length);
    expect(palette.map((tile) => tile.id)).toEqual(
      [...palette.map((tile) => tile.id)].sort((a, b) => a - b),
    );
    for (const entry of palette) expect(entry.layer).toBe(tileset.tiles[String(entry.id)]?.layer);
    for (const id of [23, 24, 25, 26, 27, 28])
      expect(palette.find((tile) => tile.id === id)?.category).toBe('walls');
    expect(palette.slice(0, 17)).toEqual([
      { id: 0, name: 'ground', color: '#A7AA8B', layer: 'ground', category: 'ground' },
      { id: 1, name: 'grass', color: '#5C7D60', layer: 'ground', category: 'ground' },
      { id: 2, name: 'water', color: '#386C78', layer: 'ground', category: 'ground' },
      { id: 3, name: 'wall', color: '#777B70', layer: 'objects', category: 'walls' },
      { id: 4, name: 'tree', color: '#47705B', layer: 'objects', category: 'decor' },
      { id: 5, name: 'building', color: '#264956', layer: 'objects', category: 'walls' },
      { id: 6, name: 'paving', color: '#A7AA8B', layer: 'ground', category: 'ground' },
      { id: 7, name: 'bridge', color: '#A16C50', layer: 'ground', category: 'ground' },
      { id: 8, name: 'bush', color: '#47705B', layer: 'objects', category: 'decor' },
      { id: 9, name: 'path', color: '#8F8A6C', layer: 'ground', category: 'ground' },
      { id: 10, name: 'flowers', color: '#5C7D60', layer: 'ground', category: 'ground' },
      { id: 11, name: 'lantern', color: '#A7AA8B', layer: 'objects', category: 'decor' },
      { id: 12, name: 'rock', color: '#777B70', layer: 'objects', category: 'decor' },
      { id: 13, name: 'fence', color: '#A16C50', layer: 'objects', category: 'walls' },
      { id: 14, name: 'well', color: '#777B70', layer: 'objects', category: 'decor' },
      { id: 15, name: 'crate', color: '#CF9565', layer: 'objects', category: 'decor' },
      { id: 16, name: 'torii', color: '#B4442E', layer: 'objects', category: 'decor' },
    ]);
  });
});

describe('applyTool', () => {
  it('paints an objects tile without touching the ground', () => {
    const state = applyTool(
      selectTool(draft(), { kind: 'tile', id: WALL, layer: 'objects' }),
      3,
      2,
    );
    expect(state.document.layers.objects[2]?.[3]).toBe(WALL);
    expect(state.document.layers.ground[2]?.[3]).toBe(GROUND);
    expect(state.dirty).toBe(true);
  });

  it('paints a ground tile and keeps the object above it', () => {
    const walled = applyTool(
      selectTool(draft(), { kind: 'tile', id: WALL, layer: 'objects' }),
      3,
      2,
    );
    const state = applyTool(selectTool(walled, { kind: 'tile', id: GRASS, layer: 'ground' }), 3, 2);
    expect(state.document.layers.ground[2]?.[3]).toBe(GRASS);
    expect(state.document.layers.objects[2]?.[3]).toBe(WALL);
  });

  it('erases the object and the spawn of a tile', () => {
    let state = applyTool(selectTool(draft(), { kind: 'tile', id: WALL, layer: 'objects' }), 3, 2);
    state = applyTool(selectTool(state, { kind: 'spawn', team: 0 }), 3, 2);
    state = applyTool(selectTool(state, { kind: 'erase' }), 3, 2);
    expect(state.document.layers.objects[2]?.[3]).toBeNull();
    expect(state.document.spawns).toEqual([]);
  });

  it('adds a spawn then replaces it when the team differs', () => {
    let state = applyTool(selectTool(draft(), { kind: 'spawn', team: 0 }), 4, 5);
    expect(state.document.spawns).toEqual([{ x: 4, y: 5, team: 0 }]);
    state = applyTool(selectTool(state, { kind: 'spawn', team: 1 }), 4, 5);
    expect(state.document.spawns).toEqual([{ x: 4, y: 5, team: 1 }]);
  });

  it('toggles a spawn off when the same team is applied twice', () => {
    let state = applyTool(selectTool(draft(), { kind: 'spawn', team: 1 }), 4, 5);
    state = applyTool(state, 4, 5);
    expect(state.document.spawns).toEqual([]);
  });

  it('places a generic spawn without a team', () => {
    const state = applyTool(selectTool(draft(), { kind: 'spawn', team: null }), 1, 1);
    expect(state.document.spawns).toEqual([{ x: 1, y: 1 }]);
  });

  it('ignores a tile outside the map', () => {
    const state = selectTool(draft(), { kind: 'tile', id: GRASS, layer: 'ground' });
    expect(applyTool(state, 8, 0)).toBe(state);
    expect(applyTool(state, -1, 3)).toBe(state);
  });

  it('refuses a new spawn beyond the format cap and leaves the state untouched', () => {
    let state = selectTool(loadDocument(newMapDocument('Test', MAP_MAX_SPAWNS + 1, 1, tileset)), {
      kind: 'spawn',
      team: null,
    });
    for (let x = 0; x < MAP_MAX_SPAWNS; x++) {
      state = applyTool(state, x, 0);
    }
    expect(state.document.spawns).toHaveLength(MAP_MAX_SPAWNS);

    const capped = applyTool(state, MAP_MAX_SPAWNS, 0);
    expect(capped).toBe(state);
  });
});

describe('removeAt', () => {
  it('removes the object first and the spawn next', () => {
    let state = applyTool(selectTool(draft(), { kind: 'tile', id: WALL, layer: 'objects' }), 3, 2);
    state = applyTool(selectTool(state, { kind: 'spawn', team: 0 }), 3, 2);
    state = removeAt(state, 3, 2);
    expect(state.document.layers.objects[2]?.[3]).toBeNull();
    expect(state.document.spawns).toEqual([{ x: 3, y: 2, team: 0 }]);
    state = removeAt(state, 3, 2);
    expect(state.document.spawns).toEqual([]);
  });

  it('leaves an empty tile untouched', () => {
    const state = draft();
    expect(removeAt(state, 3, 2)).toBe(state);
    expect(removeAt(state, 99, 0)).toBe(state);
  });
});

describe('withIssues', () => {
  it('reports a spawn standing on a solid tile', () => {
    let state = applyTool(selectTool(draft(), { kind: 'tile', id: WALL, layer: 'objects' }), 3, 2);
    state = applyTool(selectTool(state, { kind: 'spawn', team: 0 }), 3, 2);
    state = withIssues(state, tileset, null);
    expect(state.issues).toEqual([
      { code: 'SPAWN_ON_SOLID', message: 'apparition en (3, 2) sur une tuile solide', x: 3, y: 2 },
    ]);
  });

  it('adds the format issues when a requirement is given', () => {
    const state = withIssues(
      applyTool(selectTool(draft(), { kind: 'spawn', team: 0 }), 1, 1),
      tileset,
      {
        mode: 'team',
        teamCount: 2,
        playersPerTeam: 1,
      },
    );
    expect(state.issues.map((issue) => issue.code)).toEqual(['NOT_ENOUGH_SPAWNS']);
  });
});

describe('renameDocument and withDocumentId', () => {
  it('renames the document and marks it dirty', () => {
    const state = renameDocument(draft(), 'Dojo');
    expect(state.document.name).toBe('Dojo');
    expect(state.dirty).toBe(true);
  });

  it('adopts the saved id and clears the dirty flag', () => {
    const state = withDocumentId(renameDocument(draft(), 'Dojo'), 'dojo-a1b2');
    expect(state.document.id).toBe('dojo-a1b2');
    expect(state.dirty).toBe(false);
  });
});

describe('map files', () => {
  it('round-trips a document through the file helpers', () => {
    const document = applyTool(selectTool(draft(), { kind: 'spawn', team: 0 }), 1, 1).document;
    expect(parseMapFile(serializeMap(document))).toEqual(document);
  });

  it('rejects a malformed file with a readable message', () => {
    expect(() => parseMapFile('{')).toThrow(/^fichier de carte invalide/);
  });
});
