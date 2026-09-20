import { shallowHollow, shrubCanvas, windCanvas } from './art/landscapeArt';
import type { LoadedMap, TilesetDefinition } from '@ninjarena/core';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ART_SCALE } from './art/presentation';
import { P, hash, pen, rect, surface } from './art/nativeArt';
import { buildingCanvas, buildingGeometry, buildingRectangle } from './art/buildingArt';
import { DecorPlacer, decorFloorCanvas } from './decorArt';
import { neighborMask, terrainCanvas } from './art/terrainArt';
import type { SpriteArt } from './art/spriteArt';
import type { PlayerView } from './renderer';

interface Cover {
  sprite: Sprite;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Water {
  sprite: Sprite;
  frames: Texture[];
}

export class MapArt {
  readonly ground = new Container();
  readonly objects = new Container();
  private readonly textures: Texture[] = [];
  private readonly water: Water[] = [];
  private readonly wind: Water[] = [];
  private windFrame = -1;
  private readonly covers: Cover[] = [];
  private waterFrame = -1;
  private placed: Container[] = [];

  constructor(map: LoadedMap, tileset: TilesetDefinition, art: SpriteArt) {
    const size = map.tileSize,
      native = size * ART_SCALE;
    const textureCache = new Map<string, Texture>();
    const make = (key: string, draw: () => HTMLCanvasElement) => {
      let texture = textureCache.get(key);
      if (!texture) {
        texture = Texture.from(draw());
        textureCache.set(key, texture);
        this.textures.push(texture);
      }
      return texture;
    };
    // Les berges suivent la famille de matière: l'herbe fleurie ne borde pas la pelouse voisine.
    const nameAt = (x: number, y: number) => {
      const tile = tileset.tiles[String(map.groundTileIdAt(x, y))];
      if (!tile) return 'ground';
      return tile.tags.includes('water')
        ? 'water'
        : tile.tags.includes('grass')
          ? 'grass'
          : tile.name;
    };
    // Floor batching is done once in modest chunks; water only swaps shared frames at 5 Hz.
    for (let cy = 0; cy < map.heightInTiles; cy += 8)
      for (let cx = 0; cx < map.widthInTiles; cx += 8) {
        const width = Math.min(8, map.widthInTiles - cx),
          height = Math.min(8, map.heightInTiles - cy);
        const canvas = surface(width * native, height * native),
          ctx = pen(canvas);
        for (let y = cy; y < cy + height; y++)
          for (let x = cx; x < cx + width; x++) {
            const tile = tileset.tiles[String(map.groundTileIdAt(x, y))];
            if (!tile) continue;
            const kind = tile.tags.includes('water')
              ? 'water'
              : tile.tags.includes('grass')
                ? 'grass'
                : tile.name;
            const mask = neighborMask(x, y, (xx, yy) => nameAt(xx, yy) === kind),
              variant = hash(x, y) % 12;
            if (tile.name === 'path' || tile.name === 'flowers') {
              ctx.drawImage(
                decorFloorCanvas(tile.name, variant, mask, x * 32, y * 32),
                (x - cx) * native,
                (y - cy) * native,
                native,
                native,
              );
            } else if (kind === 'water') {
              const frames = Array.from({ length: 4 }, (_, phase) =>
                make(`${kind}:${mask}:${variant}:${phase}`, () =>
                  terrainCanvas(kind, variant, mask, phase, tile.color),
                ),
              );
              const sprite = new Sprite(frames[0]);
              sprite.position.set(x * size, y * size);
              sprite.width = size;
              sprite.height = size;
              this.ground.addChild(sprite);
              this.water.push({ sprite, frames });
            } else {
              ctx.drawImage(
                terrainCanvas(kind, variant, mask, 0, tile.color, x * 32, y * 32),
                (x - cx) * native,
                (y - cy) * native,
                native,
                native,
              );
              if (kind === 'ground' && hash(x, y) % 29 === 0 && map.objectTileIdAt(x, y) === null) {
                shallowHollow(ctx, (x - cx) * native + 16, (y - cy) * native + 20, 10);
              }
            }
          }
        const texture = Texture.from(canvas);
        this.textures.push(texture);
        const sprite = new Sprite(texture);
        sprite.position.set(cx * size, cy * size);
        sprite.scale.set(1 / ART_SCALE);
        this.ground.addChild(sprite);
      }
    // One uniform shadow layer stays below actors and all attack telegraphs.
    const shadows = new Graphics();
    shadows.alpha = 0.25;
    this.ground.addChild(shadows);
    const castShadow = (x: number, y: number, w: number, h: number, reach: number) => {
      shadows
        .poly([
          x,
          y + h - 2,
          x + w,
          y + h - 2,
          x + w + reach,
          y + h + reach * 0.55,
          x + reach,
          y + h + reach * 0.55,
        ])
        .fill(P.ink);
    };
    const decor = new DecorPlacer(map, tileset, size, {
      make,
      shadows,
      cover: (entry) => this.covers.push(entry),
    });
    const claimed = new Set<string>();
    for (let y = 0; y < map.heightInTiles; y++)
      for (let x = 0; x < map.widthInTiles; x++) {
        if (claimed.has(`${x}:${y}`)) continue;
        const tile = tileset.tiles[String(map.objectTileIdAt(x, y))];
        if (!tile) continue;
        const holder = new Container();
        holder.position.set(x * size, y * size);
        holder.zIndex = (y + 1) * size;
        if (tile.name === 'tree') {
          shadows
            .poly([
              x * size - 8,
              y * size + 4,
              x * size + 19,
              y * size - 4,
              x * size + 33,
              y * size + 12,
              x * size + 21,
              y * size + 20,
              x * size - 2,
              y * size + 14,
            ])
            .fill(P.ink);
          const trunk = new Sprite(art.trunk());
          trunk.position.set(0, 0);
          trunk.scale.set(size / 32);
          holder.addChild(trunk);
          const canopy = new Sprite(art.canopy(hash(x, y) % 5));
          canopy.position.set(-size / 2, -size);
          canopy.scale.set(size / 32);
          holder.addChild(canopy);
          this.covers.push({
            sprite: canopy,
            x: x * size - size / 2,
            y: y * size - size,
            width: size * 2,
            height: size * 1.75,
          });
        } else if (tile.name === 'bush') {
          shadows.ellipse(x * size + 13, y * size + 17, 14, 6).fill(P.ink);
          const sprite = new Sprite(
            make(`bush:${hash(x, y) % 4}`, () => shrubCanvas(hash(x, y) % 4)),
          );
          sprite.position.set(-2, -8);
          sprite.scale.set(0.5);
          holder.addChild(sprite);
        } else if (tile.name === 'wall') {
          castShadow(x * size, y * size, size, size, 7);
          const id = map.objectTileIdAt(x, y);
          const joins = [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ].map(([dx = 0, dy = 0]) => map.objectTileIdAt(x + dx, y + dy) === id);
          const texture = make(`wall:${joins.join('')}`, () =>
            wallCanvas(joins[0] ?? false, joins[1] ?? false, joins[2] ?? false, joins[3] ?? false),
          );
          const sprite = new Sprite(texture);
          sprite.position.y = -size / 2;
          sprite.scale.set(size / 32);
          holder.addChild(sprite);
        } else if (tile.tags.includes('building')) {
          const bounds = buildingRectangle(
            x,
            y,
            (xx, yy) => map.objectTileIdAt(xx, yy) === map.objectTileIdAt(x, y),
            claimed,
          );
          for (let dy = 0; dy < bounds.height; dy++)
            for (let dx = 0; dx < bounds.width; dx++) claimed.add(`${x + dx}:${y + dy}`);
          castShadow(x * size, y * size, bounds.width * size, bounds.height * size, 15);
          const texture = make(`${tile.name}:${bounds.width}:${bounds.height}`, () =>
            buildingCanvas(bounds.width * native, bounds.height * native, tile.name),
          );
          const sprite = new Sprite(texture);
          const geometry = buildingGeometry(bounds.width * native, bounds.height * native);
          sprite.position.set(-geometry.footX / ART_SCALE, -geometry.footY / ART_SCALE);
          sprite.scale.set(1 / ART_SCALE);
          holder.addChild(sprite);
          holder.zIndex = (y + bounds.height) * size;
          this.covers.push({
            sprite,
            x: x * size,
            y: y * size - 24,
            width: bounds.width * size,
            height: bounds.height * size,
          });
        } else if (decor.place(tile.name, x, y, holder)) {
          // Le placeur de décor a dessiné la tile: rien de plus à empiler ici.
        } else {
          // An unknown solid object remains visible and occupies exactly its declared footprint.
          const sprite = new Sprite(art.floor(tile.name, hash(x, y) % 4));
          sprite.width = size;
          sprite.height = size;
          holder.addChild(sprite);
          if (!['rock', 'bridge'].includes(tile.name)) {
            const g = new Graphics()
              .rect(0, 0, size, size)
              .fill(tile.color)
              .stroke({ color: P.ink, width: 0.5 });
            holder.addChild(g);
          }
        }
        this.objects.addChild(holder);
      }
    // Sparse animation above the baked floor, shared textures; no moving collision geometry.
    for (let y = 1; y < map.heightInTiles - 1; y++)
      for (let x = 1; x < map.widthInTiles - 1; x++) {
        const kind = nameAt(x, y),
          seed = hash(x, y);
        if (
          map.objectTileIdAt(x, y) !== null ||
          !((kind === 'grass' && seed % 4 === 0) || (kind === 'ground' && seed % 31 === 0))
        )
          continue;
        const frames = Array.from({ length: 4 }, (_, phase) =>
          make(`wind:${kind}:${phase}:${seed % 3}`, () => windCanvas(kind, phase, seed % 3)),
        );
        const sprite = new Sprite(frames[0]);
        sprite.position.set(x * size, y * size);
        sprite.scale.set(size / 32);
        this.ground.addChild(sprite);
        this.wind.push({ sprite, frames });
      }
    // Explicit colliders (e.g. the arena's diagonal wall) must never stay invisible.
    for (const shape of map.colliders) {
      if (
        shape.type === 'rect' &&
        map.terrainAt({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }).solid
      )
        continue;
      const g = new Graphics();
      let y = 0;
      if (shape.type === 'polygon') {
        g.poly(shape.points.map((p) => ({ ...p })));
        y = Math.max(...shape.points.map((p) => p.y));
      } else if (shape.type === 'circle') {
        g.circle(shape.x, shape.y, shape.radius);
        y = shape.y + shape.radius;
      } else {
        g.rect(shape.x, shape.y, shape.width, shape.height);
        y = shape.y + shape.height;
      }
      g.fill(P.stone[0]).stroke({ color: P.ink, width: 0.5 });
      g.zIndex = y;
      this.objects.addChild(g);
    }
  }

  attachDepth(depth: Container): void {
    this.placed = this.objects.removeChildren();
    for (const node of this.placed) depth.addChild(node);
  }

  advance(timeMs: number, players: readonly PlayerView[]): void {
    const frame = Math.floor(timeMs / 200) % 4;
    if (frame !== this.waterFrame) {
      this.waterFrame = frame;
      for (const water of this.water) {
        const texture = water.frames[frame];
        if (texture) water.sprite.texture = texture;
      }
    }
    const windFrame = Math.floor(timeMs / 320) % 4;
    if (windFrame !== this.windFrame) {
      this.windFrame = windFrame;
      for (const wind of this.wind) {
        const texture = wind.frames[windFrame];
        if (texture) wind.sprite.texture = texture;
      }
    }
    for (const cover of this.covers) {
      cover.sprite.alpha = players.some(
        (p) =>
          p.visible &&
          p.phase !== 'DEAD' &&
          p.position.x >= cover.x &&
          p.position.x <= cover.x + cover.width &&
          p.position.y - 12 >= cover.y &&
          p.position.y - 12 <= cover.y + cover.height,
      )
        ? 0.28
        : 1;
    }
  }
  dispose(): void {
    for (const node of this.placed) node.destroy({ children: true });
    this.placed = [];
    this.ground.destroy({ children: true });
    this.objects.destroy({ children: true });
    for (const texture of this.textures) texture.destroy(true);
  }
}

// Mur bas vu de trois quarts: dessus éclairé sur toute l'emprise, face sud de 16 px en dessous.
function wallCanvas(north: boolean, south: boolean, west: boolean, east: boolean) {
  const cv = surface(32, 48),
    c = pen(cv);
  const topRows = south ? 48 : 32;
  rect(c, 0, 0, 32, topRows, P.stone[1]);
  // Grandes dalles du chaperon, joints fins, quelques éclats groupés.
  for (let row = 0; row < topRows; row += 16) {
    rect(c, 0, row + 15, 32, 1, P.stone[0]);
    rect(c, row % 32 ? 21 : 10, row, 1, 15, P.stone[0]);
    rect(c, 2, row + 2, 7, 1, P.stone[2]);
    rect(c, (row % 32 ? 4 : 15) + 8, row + 9, 4, 1, P.stone[2]);
    rect(c, row % 32 ? 14 : 25, row + 5, 3, 1, P.stone[0]);
  }
  if (!north) {
    rect(c, 0, 0, 32, 1, P.ink);
    rect(c, 0, 1, 32, 1, P.stone[2]);
  }
  if (!west) {
    rect(c, 0, 0, 1, 48, P.ink);
    rect(c, 1, 1, 1, topRows - 1, P.stone[2]);
  }
  if (!east) {
    rect(c, 31, 0, 1, 48, P.ink);
    rect(c, 30, 1, 1, topRows - 1, P.stone[0]);
  }
  if (!south) {
    rect(c, 0, 32, 32, 1, P.edge);
    rect(c, 0, 33, 32, 14, P.stone[0]);
    for (let row = 33; row < 47; row += 5) {
      rect(c, 0, row + 4, 32, 1, P.edge);
      for (let x = row % 2 ? 5 : 11; x < 32; x += 12) rect(c, x, row, 1, 4, P.edge);
      rect(c, row % 2 ? 7 : 13, row + 1, 4, 1, P.stone[1]);
    }
    rect(c, 0, 47, 32, 1, P.ink);
    rect(c, 3, 45, 4, 2, P.green[0]);
    rect(c, 22, 46, 3, 1, P.green[1]);
  }
  return cv;
}
