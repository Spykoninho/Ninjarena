import { CURRENT_MAP_FORMAT_VERSION, MAP_MAX_SIZE, MAP_MIN_SIZE } from '@ninjarena/core';
import { spawnIssues, validateMapDocument } from '@ninjarena/core';
import type {
  MapDocument,
  MapIssue,
  MapSpawn,
  SpawnRequirement,
  TilesetDefinition,
} from '@ninjarena/core';

export type TileLayer = 'ground' | 'objects';

// La couche voyage avec l'outil: le modèle ne connaît pas le tileset au moment de peindre.
export type EditorTool =
  | { kind: 'tile'; id: number; layer: TileLayer }
  | { kind: 'erase' }
  | { kind: 'spawn'; team: number | null };

export interface EditorState {
  document: MapDocument;
  tool: EditorTool;
  dirty: boolean;
  issues: MapIssue[];
}

export interface PaletteEntry {
  id: number;
  name: string;
  color: string;
  layer: TileLayer;
}

export const DEFAULT_TOOL: EditorTool = { kind: 'tile', id: 0, layer: 'ground' };

export function fillTileId(tileset: TilesetDefinition): number {
  const walkable = paletteOf(tileset).find(
    (entry) => entry.layer === 'ground' && tileset.tiles[String(entry.id)]?.solid !== true,
  );
  return walkable?.id ?? 0;
}

export function paletteOf(tileset: TilesetDefinition): PaletteEntry[] {
  return Object.entries(tileset.tiles)
    .map(([key, tile]) => ({
      id: Number(key),
      name: tile.name,
      color: tile.color,
      layer: tile.layer,
    }))
    .sort((a, b) => a.id - b.id);
}

export function newMapDocument(
  name: string,
  width: number,
  height: number,
  tileset: TilesetDefinition,
): MapDocument {
  const columns = clampSize(width);
  const rows = clampSize(height);
  const fill = fillTileId(tileset);
  return {
    version: CURRENT_MAP_FORMAT_VERSION,
    id: 'draft',
    name,
    tileset: tileset.id,
    width: columns,
    height: rows,
    layers: {
      ground: Array.from({ length: rows }, () => Array.from({ length: columns }, () => fill)),
      objects: Array.from({ length: rows }, () =>
        Array.from({ length: columns }, (): number | null => null),
      ),
    },
    colliders: [],
    spawns: [],
  };
}

export function loadDocument(document: MapDocument): EditorState {
  return { document, tool: DEFAULT_TOOL, dirty: false, issues: [] };
}

export function selectTool(state: EditorState, tool: EditorTool): EditorState {
  return { ...state, tool };
}

export function renameDocument(state: EditorState, name: string): EditorState {
  return { ...state, document: { ...state.document, name }, dirty: true };
}

// Le serveur choisit l'identifiant définitif: la prochaine sauvegarde doit écraser la même carte.
export function withDocumentId(state: EditorState, id: string): EditorState {
  return { ...state, document: { ...state.document, id }, dirty: false };
}

export function withIssues(
  state: EditorState,
  tileset: TilesetDefinition,
  requirement: SpawnRequirement | null,
): EditorState {
  const issues = validateMapDocument(state.document, tileset);
  const extra = requirement === null ? [] : spawnIssues(state.document, requirement);
  return { ...state, issues: [...issues, ...extra] };
}

export function applyTool(state: EditorState, x: number, y: number): EditorState {
  if (!inBounds(state.document, x, y)) return state;
  switch (state.tool.kind) {
    case 'tile':
      return state.tool.layer === 'ground'
        ? paintGround(state, x, y, state.tool.id)
        : paintObject(state, x, y, state.tool.id);
    case 'erase':
      return eraseAt(state, x, y);
    case 'spawn':
      return toggleSpawn(state, x, y, state.tool.team);
  }
}

export function removeAt(state: EditorState, x: number, y: number): EditorState {
  if (!inBounds(state.document, x, y)) return state;
  const object = state.document.layers.objects[y]?.[x] ?? null;
  if (object !== null) return paintObject(state, x, y, null);
  const spawns = withoutSpawnAt(state.document.spawns, x, y);
  return spawns.length === state.document.spawns.length ? state : withSpawns(state, spawns);
}

function clampSize(value: number): number {
  const rounded = Math.floor(Number.isFinite(value) ? value : MAP_MIN_SIZE);
  return Math.min(MAP_MAX_SIZE, Math.max(MAP_MIN_SIZE, rounded));
}

function inBounds(document: MapDocument, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < document.width && y < document.height;
}

function paintGround(state: EditorState, x: number, y: number, id: number): EditorState {
  const rows = state.document.layers.ground;
  if (rows[y]?.[x] === id) return state;
  const ground = replaceRow(rows, x, y, id);
  return {
    ...state,
    document: { ...state.document, layers: { ...state.document.layers, ground } },
    dirty: true,
  };
}

function paintObject(state: EditorState, x: number, y: number, id: number | null): EditorState {
  const rows = state.document.layers.objects;
  if (rows[y]?.[x] === id) return state;
  const objects = replaceRow(rows, x, y, id);
  return {
    ...state,
    document: { ...state.document, layers: { ...state.document.layers, objects } },
    dirty: true,
  };
}

function replaceRow<T>(rows: T[][], x: number, y: number, value: T): T[][] {
  return rows.map((row, index) =>
    index === y ? row.map((cell, column) => (column === x ? value : cell)) : row,
  );
}

function eraseAt(state: EditorState, x: number, y: number): EditorState {
  const cleared = paintObject(state, x, y, null);
  const spawns = withoutSpawnAt(cleared.document.spawns, x, y);
  return spawns.length === cleared.document.spawns.length ? cleared : withSpawns(cleared, spawns);
}

function toggleSpawn(state: EditorState, x: number, y: number, team: number | null): EditorState {
  const current = state.document.spawns.find((spawn) => spawn.x === x && spawn.y === y);
  const wanted = team === null ? undefined : team;
  if (current !== undefined && current.team === wanted) {
    return withSpawns(state, withoutSpawnAt(state.document.spawns, x, y));
  }
  const spawn: MapSpawn = team === null ? { x, y } : { x, y, team };
  return withSpawns(state, [...withoutSpawnAt(state.document.spawns, x, y), spawn]);
}

function withoutSpawnAt(spawns: MapSpawn[], x: number, y: number): MapSpawn[] {
  return spawns.filter((spawn) => spawn.x !== x || spawn.y !== y);
}

function withSpawns(state: EditorState, spawns: MapSpawn[]): EditorState {
  return { ...state, document: { ...state.document, spawns }, dirty: true };
}
