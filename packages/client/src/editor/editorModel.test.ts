import { loadContent } from '@ninjarena/content';
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
  it('lists every tile sorted by id with its layer', () => {
    expect(paletteOf(tileset)).toEqual([
      { id: 0, name: 'ground', color: '#c9b97a', layer: 'ground' },
      { id: 1, name: 'grass', color: '#5aa15a', layer: 'ground' },
      { id: 2, name: 'water', color: '#4a86c8', layer: 'ground' },
      { id: 3, name: 'wall', color: '#6b6b7a', layer: 'objects' },
      { id: 4, name: 'tree', color: '#2f6b3a', layer: 'objects' },
      { id: 5, name: 'building', color: '#8a4b3b', layer: 'objects' },
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
      { code: 'SPAWN_ON_SOLID', message: 'spawn at (3, 2) is on a solid tile', x: 3, y: 2 },
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
    expect(() => parseMapFile('{')).toThrow(/^invalid map file/);
  });
});
