import { BIOME_OBJECTS, biomeObject } from './art/biomeArt';
import { Sprite } from 'pixi.js';
import type { Container, Graphics, Texture } from 'pixi.js';
import type { LoadedMap, TilesetDefinition } from '@ninjarena/core';
import { P, hash } from './art/nativeArt';
import {
  TORII_FRAME,
  crateCanvas,
  fenceCanvas,
  flowersTile,
  lanternCanvas,
  pathTile,
  rockCanvas,
  toriiLintelCanvas,
  toriiPostsCanvas,
  wellCanvas,
} from './art/decorArt';

/** Art pixels per tile side; a tile is 32 art pixels wide whatever the world tile size. */
const TILE_ART = 32;
const DECOR_OBJECTS = ['lantern', 'rock', 'fence', 'well', 'crate', 'torii', ...BIOME_OBJECTS];
const DECOR_FLOORS = ['path', 'flowers'];

export function isDecorObject(name: string): boolean {
  return DECOR_OBJECTS.includes(name);
}

export function isDecorFloor(name: string): boolean {
  return DECOR_FLOORS.includes(name);
}

/** Cardinal neighbour bits, in the `neighborMask` order: north, east, south, west. */
export function cardinalMask(
  same: (x: number, y: number) => boolean,
  x: number,
  y: number,
): number {
  return (
    (same(x, y - 1) ? 1 : 0) |
    (same(x + 1, y) ? 2 : 0) |
    (same(x, y + 1) ? 4 : 0) |
    (same(x - 1, y) ? 8 : 0)
  );
}

/**
 * How many tiles the gate anchored on this cell covers: 2 for a full gate drawn from its left
 * pillar, 1 for a lone pillar, 0 for the right half of a pair, which draws nothing.
 */
export function toriiSpan(
  isTorii: (x: number, y: number) => boolean,
  x: number,
  y: number,
): 0 | 1 | 2 {
  let offset = 0;
  while (isTorii(x - offset - 1, y)) offset++;
  // Un portique consomme deux tiles: le reste d'une série impaire dresse un pilier seul.
  if (offset % 2 === 1) return 0;
  return isTorii(x + 1, y) ? 2 : 1;
}

export function decorFloorCanvas(
  name: string,
  variant: number,
  neighbors: number,
  worldX: number,
  worldY: number,
): HTMLCanvasElement {
  return name === 'path'
    ? pathTile(variant, neighbors, worldX, worldY)
    : flowersTile(variant, worldX, worldY);
}

/** Single-cell recipe for the editor preview; null when the tile is not a decor object. */
export function decorObjectCanvas(
  name: string,
  variant: number,
  neighbors: number,
): HTMLCanvasElement | null {
  if (BIOME_OBJECTS.includes(name)) return biomeObject(name, variant, neighbors);
  switch (name) {
    case 'lantern':
      return lanternCanvas();
    case 'rock':
      return rockCanvas(variant);
    case 'fence':
      return fenceCanvas(neighbors, true);
    case 'well':
      return wellCanvas();
    case 'crate':
      return crateCanvas(variant);
    case 'torii':
      // L'éditeur travaille tile par tile: chaque case montre son pilier.
      return toriiPostsCanvas(1);
    default:
      return null;
  }
}

export interface DecorCover {
  sprite: Sprite;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DecorTarget {
  make(key: string, draw: () => HTMLCanvasElement): Texture;
  shadows: Graphics;
  cover(entry: DecorCover): void;
}

export class DecorPlacer {
  private readonly unit: number;

  constructor(
    private readonly map: LoadedMap,
    private readonly tileset: TilesetDefinition,
    private readonly size: number,
    private readonly target: DecorTarget,
  ) {
    this.unit = size / TILE_ART;
  }

  /** Returns false when the tile is not a decor object, leaving it to the caller's fallback. */
  place(name: string, x: number, y: number, holder: Container): boolean {
    if (BIOME_OBJECTS.includes(name)) {
      const mask = cardinalMask((xx, yy) => this.named(name, xx, yy), x, y);
      const variant = hash(x, y) % 4;
      this.cast(x, y, 1, 7);
      const sprite = this.sprite(
        holder,
        this.target.make(`${name}:${mask}:${variant}`, () => biomeObject(name, variant, mask)!),
        TILE_ART,
      );
      this.target.cover({
        sprite,
        x: x * this.size,
        y: (y - 0.5) * this.size,
        width: this.size,
        height: this.size * 1.5,
      });
      return true;
    }
    switch (name) {
      case 'lantern':
        return this.lantern(x, y, holder);
      case 'rock':
        return this.rock(x, y, holder);
      case 'fence':
        return this.fence(x, y, holder);
      case 'well':
        return this.well(x, y, holder);
      case 'crate':
        return this.crate(x, y, holder);
      case 'torii':
        return this.torii(x, y, holder);
      default:
        return false;
    }
  }

  private named(name: string, x: number, y: number): boolean {
    return this.tileset.tiles[String(this.map.objectTileIdAt(x, y))]?.name === name;
  }

  // Ombre portée vers le bas-droite, longueur proportionnelle à la hauteur de l'objet.
  private cast(x: number, y: number, tiles: number, reach: number): void {
    const s = this.size,
      px = x * s,
      py = y * s,
      w = tiles * s;
    this.target.shadows
      .poly([
        px,
        py + s - 2,
        px + w,
        py + s - 2,
        px + w + reach,
        py + s + reach * 0.55,
        px + reach,
        py + s + reach * 0.55,
      ])
      .fill(P.ink);
  }

  private blob(x: number, y: number, cx: number, cy: number, rx: number, ry: number): void {
    this.target.shadows.ellipse(x * this.size + cx, y * this.size + cy, rx, ry).fill(P.ink);
  }

  /**
   * Bottom-centres a recipe on its footprint. `frame` is the height the recipe was composed in,
   * so a piece drawn at the top of a taller frame (the torii lintel) keeps its elevation.
   */
  private sprite(
    holder: Container,
    texture: Texture,
    footprint: number,
    frame = texture.height,
  ): Sprite {
    const sprite = new Sprite(texture);
    sprite.position.set(
      ((footprint - texture.width) / 2) * this.unit,
      (TILE_ART - frame) * this.unit,
    );
    sprite.scale.set(this.unit);
    holder.addChild(sprite);
    return sprite;
  }

  private lantern(x: number, y: number, holder: Container): boolean {
    this.blob(x, y, 11, 14, 9, 4);
    this.sprite(holder, this.target.make('lantern', lanternCanvas), TILE_ART);
    return true;
  }

  private rock(x: number, y: number, holder: Container): boolean {
    const variant = hash(x, y) % 3;
    this.cast(x, y, 1, 6);
    this.sprite(
      holder,
      this.target.make(`rock:${variant}`, () => rockCanvas(variant)),
      TILE_ART,
    );
    return true;
  }

  private fence(x: number, y: number, holder: Container): boolean {
    const mask = cardinalMask((xx, yy) => this.named('fence', xx, yy), x, y);
    const mid = (x + y) % 2 === 0;
    this.cast(x, y, 1, 4);
    this.sprite(
      holder,
      this.target.make(`fence:${mask}:${mid}`, () => fenceCanvas(mask, mid)),
      TILE_ART,
    );
    return true;
  }

  private well(x: number, y: number, holder: Container): boolean {
    this.cast(x, y, 1, 9);
    this.sprite(holder, this.target.make('well', wellCanvas), TILE_ART);
    return true;
  }

  private crate(x: number, y: number, holder: Container): boolean {
    const variant = hash(x, y) % 2;
    this.cast(x, y, 1, 7);
    this.sprite(
      holder,
      this.target.make(`crate:${variant}`, () => crateCanvas(variant)),
      TILE_ART,
    );
    return true;
  }

  private torii(x: number, y: number, holder: Container): boolean {
    const span = toriiSpan((xx, yy) => this.named('torii', xx, yy), x, y);
    // La moitié droite d'un portique est déjà dessinée par sa tile de gauche.
    if (span === 0) return true;
    const footprint = span * TILE_ART;
    for (let i = 0; i < span; i++) this.blob(x + i, y, 16, 14, 8, 4);
    this.sprite(
      holder,
      this.target.make(`torii:posts:${span}`, () => toriiPostsCanvas(span)),
      footprint,
    );
    if (span !== 2) return true;
    const lintel = this.sprite(
      holder,
      this.target.make('torii:lintel', () => toriiLintelCanvas(2)),
      footprint,
      TORII_FRAME,
    );
    // Le linteau monte au-dessus de la rangée précédente: il s'efface comme une canopée.
    const lift = (TORII_FRAME - TILE_ART) * this.unit;
    this.target.cover({
      sprite: lintel,
      x: x * this.size,
      y: y * this.size - lift - 6,
      width: span * this.size,
      height: lift + 6,
    });
    return true;
  }
}
