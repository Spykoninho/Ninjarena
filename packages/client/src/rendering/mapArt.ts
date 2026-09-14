import { shallowHollow, shrubCanvas, windCanvas } from './art/landscapeArt';
import type { LoadedMap, TilesetDefinition } from '@ninjarena/core';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ART_SCALE } from './art/presentation';
import { P, hash, line, pen, rect, surface } from './art/nativeArt';
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
    const nameAt = (x: number, y: number) =>
      tileset.tiles[String(map.groundTileIdAt(x, y))]?.name ?? 'ground';
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
            const mask = neighborMask(x, y, (xx, yy) => nameAt(xx, yy) === tile.name),
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
          const south = map.objectTileIdAt(x, y + 1) === map.objectTileIdAt(x, y);
          const texture = make(`wall:${south}`, () => {
            const cv = surface(32, 48),
              c = pen(cv);
            rect(c, 0, 0, 32, 48, P.stone[0]);
            rect(c, 0, 0, 32, south ? 48 : 32, P.stone[0]);
            rect(c, 0, 0, 1, 48, P.edge);
            rect(c, 31, 0, 1, 48, P.edge);
            for (let row = 9; row < (south ? 48 : 30); row += 8) {
              rect(c, 2, row, 28, 1, P.edge);
              rect(c, row % 3 ? 10 : 21, row + 1, 1, 7, P.edge);
              rect(c, 3, row + 2, 6, 1, P.stone[1]);
            }
            // Cap, vertical face and shaded right edge: all stay inside the solid footprint.
            rect(c, 1, 0, 30, 9, P.stone[1]);
            rect(c, 1, 9, 30, 2, P.edge);
            rect(c, 28, 11, 3, 37, P.edge);
            rect(c, 0, 0, 32, 2, P.stone[2]);
            rect(c, 1, 6, 30, 1, P.landscape.sand);
            if (!south)
              for (let row = 33; row < 46; row += 6) {
                line(c, 0, row, 31, row, P.edge);
                rect(c, row % 2 ? 9 : 22, row, 1, 5, P.edge);
                rect(c, 2, row + 2, 6, 1, P.stone[1]);
              }
            rect(c, 0, 47, 32, 1, P.ink);
            return cv;
          });
          const sprite = new Sprite(texture);
          sprite.position.y = -size / 2;
          sprite.scale.set(size / 32);
          holder.addChild(sprite);
        } else if (tile.name === 'building') {
          const bounds = buildingRectangle(
            x,
            y,
            (xx, yy) => tileset.tiles[String(map.objectTileIdAt(xx, yy))]?.name === 'building',
            claimed,
          );
          for (let dy = 0; dy < bounds.height; dy++)
            for (let dx = 0; dx < bounds.width; dx++) claimed.add(`${x + dx}:${y + dy}`);
          castShadow(x * size, y * size, bounds.width * size, bounds.height * size, 15);
          const texture = make(`building:${bounds.width}:${bounds.height}`, () =>
            buildingCanvas(bounds.width * native, bounds.height * native),
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
