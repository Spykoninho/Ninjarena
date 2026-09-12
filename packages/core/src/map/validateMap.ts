import { isSolidTile } from '../definitions';
import type { MapDocument, TilesetDefinition } from '../definitions';

export type MapIssueCode =
  | 'UNKNOWN_TILE'
  | 'NO_SPAWN'
  | 'SPAWN_OUT_OF_BOUNDS'
  | 'SPAWN_ON_SOLID'
  | 'SPAWN_DUPLICATE'
  | 'SPAWN_UNREACHABLE'
  | 'NOT_ENOUGH_SPAWNS';

export interface MapIssue {
  code: MapIssueCode;
  message: string;
  x?: number;
  y?: number;
}

export interface SpawnRequirement {
  mode: 'ffa' | 'team';
  teamCount: number;
  playersPerTeam: number;
}

const NEIGHBOUR_OFFSETS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const UNKNOWN_TILE_ID = -1;

interface TileScan {
  issues: MapIssue[];
  walkable: boolean[];
}

// Un id absent du tileset bloque la case: on ne sait pas si elle est franchissable.
function scanTiles(doc: MapDocument, tileset: TilesetDefinition): TileScan {
  const issues: MapIssue[] = [];
  const walkable: boolean[] = [];
  for (let y = 0; y < doc.height; y++) {
    const groundRow = doc.layers.ground[y] ?? [];
    const objectRow = doc.layers.objects[y] ?? [];
    for (let x = 0; x < doc.width; x++) {
      const groundId = groundRow[x] ?? UNKNOWN_TILE_ID;
      const objectId = objectRow[x] ?? null;
      let unknown = false;
      if (tileset.tiles[String(groundId)] === undefined) {
        unknown = true;
        issues.push({
          code: 'UNKNOWN_TILE',
          message: `unknown tile id ${groundId} at (${x}, ${y})`,
          x,
          y,
        });
      }
      if (objectId !== null && tileset.tiles[String(objectId)] === undefined) {
        unknown = true;
        issues.push({
          code: 'UNKNOWN_TILE',
          message: `unknown tile id ${objectId} at (${x}, ${y})`,
          x,
          y,
        });
      }
      walkable.push(unknown ? false : !isSolidTile(tileset, groundId, objectId));
    }
  }
  return { issues, walkable };
}

function bfsReachable(
  walkable: readonly boolean[],
  width: number,
  height: number,
  startX: number,
  startY: number,
): Uint8Array {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [startY * width + startX];
  visited[startY * width + startX] = 1;
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const x = current % width;
    const y = Math.floor(current / width);
    for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbourIndex = ny * width + nx;
      if (visited[neighbourIndex] === 1 || !walkable[neighbourIndex]) continue;
      visited[neighbourIndex] = 1;
      queue.push(neighbourIndex);
    }
  }
  return visited;
}

export function walkableTiles(doc: MapDocument, tileset: TilesetDefinition): boolean[] {
  return scanTiles(doc, tileset).walkable;
}

export function validateMapDocument(doc: MapDocument, tileset: TilesetDefinition): MapIssue[] {
  const { issues, walkable } = scanTiles(doc, tileset);

  if (doc.spawns.length === 0) {
    issues.push({ code: 'NO_SPAWN', message: 'the map has no spawn point' });
  }

  const seen = new Set<string>();
  const reachabilityCandidates: { x: number; y: number }[] = [];

  for (const spawn of doc.spawns) {
    const { x, y } = spawn;
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) {
      issues.push({
        code: 'SPAWN_OUT_OF_BOUNDS',
        message: `spawn at (${x}, ${y}) is out of bounds`,
        x,
        y,
      });
      continue;
    }
    if (!walkable[y * doc.width + x]) {
      issues.push({
        code: 'SPAWN_ON_SOLID',
        message: `spawn at (${x}, ${y}) is on a solid tile`,
        x,
        y,
      });
      continue;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) {
      issues.push({
        code: 'SPAWN_DUPLICATE',
        message: `spawn at (${x}, ${y}) duplicates another spawn`,
        x,
        y,
      });
    } else {
      seen.add(key);
    }
    reachabilityCandidates.push({ x, y });
  }

  const start = reachabilityCandidates[0];
  if (start !== undefined) {
    const visited = bfsReachable(walkable, doc.width, doc.height, start.x, start.y);
    for (const candidate of reachabilityCandidates.slice(1)) {
      if (visited[candidate.y * doc.width + candidate.x] !== 1) {
        issues.push({
          code: 'SPAWN_UNREACHABLE',
          message: `spawn at (${candidate.x}, ${candidate.y}) is unreachable from the first spawn`,
          x: candidate.x,
          y: candidate.y,
        });
      }
    }
  }

  return issues;
}

export function spawnIssues(doc: MapDocument, requirement: SpawnRequirement): MapIssue[] {
  const generic = doc.spawns.filter((spawn) => spawn.team === undefined).length;

  if (requirement.mode === 'ffa') {
    const needed = requirement.teamCount * requirement.playersPerTeam;
    if (generic < needed) {
      return [
        {
          code: 'NOT_ENOUGH_SPAWNS',
          message: `${needed} generic spawns needed, ${generic} found`,
        },
      ];
    }
    return [];
  }

  const issues: MapIssue[] = [];
  for (let team = 0; team < requirement.teamCount; team++) {
    const tagged = doc.spawns.filter((spawn) => spawn.team === team).length;
    const found = tagged + generic;
    if (found < requirement.playersPerTeam) {
      issues.push({
        code: 'NOT_ENOUGH_SPAWNS',
        message: `team ${team + 1} needs ${requirement.playersPerTeam} spawns, ${found} found`,
      });
    }
  }
  return issues;
}
