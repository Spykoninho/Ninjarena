import type { AABB, Shape } from '../collision';
import { SpatialGrid, mergeSolidTiles, shapeBounds } from '../collision';
import type { MapDefinition, ShapeDefinition, TileType, TilesetDefinition } from '../definitions';
import { EMPTY_TILE_CHAR } from '../definitions';
import type { Vec2 } from '../math/vec2';

export interface TerrainInfo {
  readonly solid: boolean;
  readonly speedMultiplier: number;
  readonly tags: readonly string[];
}

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
  readonly team?: number;
}

export const OUT_OF_BOUNDS_TERRAIN: TerrainInfo = { solid: true, speedMultiplier: 1, tags: [] };

const EMPTY_TILE_ID = -1;
const BROADPHASE_CELL_TILES = 4;

interface LoadedMapData {
  id: string;
  tileSize: number;
  widthInTiles: number;
  heightInTiles: number;
  groundTiles: readonly number[];
  objectTiles: readonly number[];
  terrain: readonly TerrainInfo[];
  colliders: readonly Shape[];
  spawns: readonly SpawnPoint[];
}

export class LoadedMap {
  readonly id: string;
  readonly tileSize: number;
  readonly widthInTiles: number;
  readonly heightInTiles: number;
  readonly widthInUnits: number;
  readonly heightInUnits: number;
  readonly colliders: readonly Shape[];
  readonly spawns: readonly SpawnPoint[];

  private readonly groundTiles: readonly number[];
  private readonly objectTiles: readonly number[];
  private readonly terrain: readonly TerrainInfo[];
  private readonly broadphase: SpatialGrid<Shape>;

  private constructor(data: LoadedMapData) {
    this.id = data.id;
    this.tileSize = data.tileSize;
    this.widthInTiles = data.widthInTiles;
    this.heightInTiles = data.heightInTiles;
    this.widthInUnits = data.widthInTiles * data.tileSize;
    this.heightInUnits = data.heightInTiles * data.tileSize;
    this.colliders = data.colliders;
    this.spawns = data.spawns;
    this.groundTiles = data.groundTiles;
    this.objectTiles = data.objectTiles;
    this.terrain = data.terrain;
    this.broadphase = new SpatialGrid<Shape>(data.tileSize * BROADPHASE_CELL_TILES);
    for (const collider of this.colliders) this.broadphase.insert(collider, shapeBounds(collider));
  }

  static fromDefinitions(map: MapDefinition, tileset: TilesetDefinition): LoadedMap {
    if (map.tileset !== tileset.id) {
      throw new Error(`map "${map.id}" expects tileset "${map.tileset}" but got "${tileset.id}"`);
    }
    const groundTiles = readLayer(map, map.layers.ground, tileset);
    const objectTiles = readLayer(map, map.layers.objects, tileset);
    const terrain: TerrainInfo[] = [];
    for (let i = 0; i < groundTiles.length; i++) {
      terrain.push(
        terrainOf(tileTypeOf(tileset, groundTiles[i]), tileTypeOf(tileset, objectTiles[i])),
      );
    }
    const colliders: Shape[] = mergeSolidTiles(
      terrain.map((info) => info.solid),
      map.width,
      map.height,
      tileset.tileSize,
    );
    for (const collider of map.colliders) colliders.push(toShape(collider));
    return new LoadedMap({
      id: map.id,
      tileSize: tileset.tileSize,
      widthInTiles: map.width,
      heightInTiles: map.height,
      groundTiles,
      objectTiles,
      terrain,
      colliders,
      spawns: map.spawns.map((spawn) => ({ x: spawn.x, y: spawn.y, team: spawn.team })),
    });
  }

  tileAt(tx: number, ty: number): TerrainInfo {
    const index = this.indexOf(tx, ty);
    return index === EMPTY_TILE_ID
      ? OUT_OF_BOUNDS_TERRAIN
      : (this.terrain[index] ?? OUT_OF_BOUNDS_TERRAIN);
  }

  terrainAt(position: Vec2): TerrainInfo {
    return this.tileAt(
      Math.floor(position.x / this.tileSize),
      Math.floor(position.y / this.tileSize),
    );
  }

  collidersNear(bounds: AABB): Shape[] {
    return this.broadphase.query(bounds);
  }

  groundTileIdAt(tx: number, ty: number): number {
    const index = this.indexOf(tx, ty);
    return index === EMPTY_TILE_ID ? EMPTY_TILE_ID : (this.groundTiles[index] ?? EMPTY_TILE_ID);
  }

  objectTileIdAt(tx: number, ty: number): number {
    const index = this.indexOf(tx, ty);
    return index === EMPTY_TILE_ID ? EMPTY_TILE_ID : (this.objectTiles[index] ?? EMPTY_TILE_ID);
  }

  private indexOf(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.widthInTiles || ty >= this.heightInTiles) {
      return EMPTY_TILE_ID;
    }
    return ty * this.widthInTiles + tx;
  }
}

function readLayer(
  map: MapDefinition,
  rows: readonly string[],
  tileset: TilesetDefinition,
): number[] {
  const tiles: number[] = [];
  for (let ty = 0; ty < map.height; ty++) {
    const row = rows[ty] ?? '';
    for (let tx = 0; tx < map.width; tx++) {
      const char = row[tx];
      if (char === undefined || char === EMPTY_TILE_CHAR) {
        tiles.push(EMPTY_TILE_ID);
        continue;
      }
      const id = map.legend[char];
      if (id === undefined) {
        throw new Error(
          `map "${map.id}" uses character "${char}" which is missing from the legend`,
        );
      }
      if (tileset.tiles[String(id)] === undefined) {
        throw new Error(
          `map "${map.id}" uses tile id ${id} which is missing from tileset "${tileset.id}"`,
        );
      }
      tiles.push(id);
    }
  }
  return tiles;
}

function tileTypeOf(tileset: TilesetDefinition, id: number | undefined): TileType | undefined {
  if (id === undefined || id === EMPTY_TILE_ID) return undefined;
  return tileset.tiles[String(id)];
}

function terrainOf(ground: TileType | undefined, object: TileType | undefined): TerrainInfo {
  // L'objet prend le pas sur le sol pour les effets, mais la solidité cumule les deux couches.
  const source = object ?? ground;
  return {
    solid: (ground?.solid ?? false) || (object?.solid ?? false),
    speedMultiplier: source?.speedMultiplier ?? 1,
    tags: source?.tags ?? [],
  };
}

function toShape(shape: ShapeDefinition): Shape {
  switch (shape.type) {
    case 'rect':
      return { type: 'rect', x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'circle':
      return { type: 'circle', x: shape.x, y: shape.y, radius: shape.radius };
    case 'polygon':
      return { type: 'polygon', points: shape.points.map((point) => ({ x: point.x, y: point.y })) };
  }
}
