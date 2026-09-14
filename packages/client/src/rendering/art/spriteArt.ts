import { treeCanopyCanvas, treeTrunkCanvas } from './volumeArt';
import { Texture } from 'pixi.js';
import type { Animation } from './presentation';
import type { Direction, Layer } from './nativeArt';
import { P, ellipse, ninja, pen, rect, surface, tile } from './nativeArt';

// Textures live for one renderer session and are shared by all actors/afterimages.
export class SpriteArt {
  private readonly textures = new Map<string, Texture>();

  pose(direction: Direction, animation: Animation, frame: number, skin = 0): Texture {
    const key = `${direction}:${animation}:${frame}:${skin}`;
    return this.cached(key, () => {
      const canvas = surface(64, 64),
        ctx = pen(canvas);
      const cloth = [P.indigo, P.wood, P.green, P.indigo][skin % 4] ?? P.indigo;
      const step = animation === 'walk' ? ([0, -1, -1, 0, 1, 1][frame % 6] ?? 0) : 0;
      const layers: Layer[] = ['Body', 'Clothes', 'Hair', 'Headgear', 'Accessory', 'Weapon'];
      for (const layer of layers) {
        const image = ninja({
          direction,
          cloth,
          skin: skin === 1 ? P.darkSkin : P.skin,
          step,
          layer,
          weapon: true,
          hat: skin === 1,
        });
        ctx.save();
        if (animation === 'death' && frame >= 3) {
          // A pixel-grid quarter turn gives a compact fallen silhouette, never scales it.
          ctx.translate(32, 41 + Math.min(3, frame - 3));
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(image, -24, -16);
        } else {
          let y = 16;
          if (animation === 'idle' && frame === 2 && layer !== 'Body') y--;
          if (animation === 'walk' && frame % 3 === 1 && layer !== 'Body') y--;
          if (animation === 'death') y += frame * 2;
          if (animation === 'hit') {
            ctx.drawImage(image, 16 + (direction === 'w' ? 1 : -1), y + (frame === 0 ? 1 : 0));
          } else if (animation === 'dash') {
            for (let row = 0; row < 32; row++) {
              const lean =
                Math.floor((29 - row) / 8) * (direction === 'w' ? -1 : direction === 'e' ? 1 : 0);
              ctx.drawImage(image, 0, row, 32, 1, 16 + lean, y + row, 32, 1);
            }
          } else {
            ctx.drawImage(image, 16, y);
          }
        }
        ctx.restore();
      }
      if (animation === 'attack' || animation === 'cast') {
        // Shared hand/weapon sockets: anticipatory pose followed by an extended release.
        const extension = animation === 'attack' ? ([0, 2, 4, 1][frame] ?? 0) : frame < 2 ? 0 : 2;
        const x = direction === 'w' ? 22 - extension : direction === 'e' ? 40 + extension : 29;
        const y = direction === 'n' ? 29 : direction === 's' ? 36 : 34;
        rect(ctx, x, y, 4, 3, P.ink);
        rect(ctx, x, y, 3, 2, P.skin[1]);
        if (animation === 'cast' && frame >= 2) {
          rect(ctx, x - 5, y, 3, 2, P.skin[1]);
        }
      }
      return canvas;
    });
  }

  floor(kind: string, variant: number): Texture {
    return this.cached(`tile:${kind}:${variant}`, () => tile(kind, variant));
  }

  canopy(variant: number): Texture {
    return this.cached(`tree:${variant}`, () => treeCanopyCanvas(variant));
  }
  trunk(): Texture {
    return this.cached('trunk', () => treeTrunkCanvas());
  }

  private cached(key: string, draw: () => HTMLCanvasElement): Texture {
    let texture = this.textures.get(key);
    if (texture === undefined) {
      texture = Texture.from(draw());
      this.textures.set(key, texture);
    }
    return texture;
  }

  dispose(): void {
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
  }
}

export function iconCanvas(family: string): HTMLCanvasElement {
  const canvas = surface(24, 24),
    ctx = pen(canvas);
  // Small icons use the same palette and shape grammar, with no text baked into the asset.
  if (family === 'dash') {
    for (const x of [6, 13]) {
      rect(ctx, x, 5, 2, 3, P.cyan);
      rect(ctx, x + 2, 8, 2, 3, P.cyan);
      rect(ctx, x + 4, 11, 2, 3, P.ivory);
      rect(ctx, x + 2, 14, 2, 3, P.cyan);
      rect(ctx, x, 17, 2, 2, P.cyan);
    }
  } else if (family === 'defense') {
    for (let y = 4; y < 18; y++) {
      const inset = Math.max(0, y - 12);
      rect(ctx, 4 + inset, y, 2, 1, P.mint);
      rect(ctx, 18 - inset, y, 2, 1, P.mint);
    }
    rect(ctx, 5, 3, 14, 2, P.mint);
  } else if (family === 'wall') {
    for (let y = 5; y < 20; y += 5)
      for (let x = 3; x < 20; x += 8) {
        rect(ctx, x, y, 7, 4, P.stone[1]);
        rect(ctx, x, y, 7, 1, P.stone[2]);
      }
  } else if (family === 'control') {
    rect(ctx, 6, 10, 13, 10, P.violet);
    rect(ctx, 8, 5, 2, 6, P.violet);
    rect(ctx, 16, 5, 2, 6, P.violet);
    rect(ctx, 9, 4, 8, 2, P.violet);
    rect(ctx, 12, 13, 2, 4, P.ink);
  } else if (family === 'area' || family === 'trap') {
    ellipse(ctx, 12, 13, 9, 8, P.danger, true);
    rect(ctx, 10, 7, 3, 10, P.gold);
    rect(ctx, 7, 11, 9, 3, P.gold);
  } else if (family === 'teleport') {
    rect(ctx, 4, 5, 2, 13, P.violet);
    rect(ctx, 6, 4, 5, 2, P.violet);
    rect(ctx, 6, 18, 5, 2, P.violet);
    rect(ctx, 17, 5, 2, 13, P.ivory);
    rect(ctx, 12, 4, 5, 2, P.ivory);
    rect(ctx, 12, 18, 5, 2, P.ivory);
  } else if (family === 'projectile') {
    for (let x = 4; x < 20; x++) {
      const h = Math.max(1, 5 - Math.abs(x - 14));
      rect(ctx, x, 12 - h, 1, h * 2, P.danger);
    }
    rect(ctx, 11, 11, 8, 2, P.gold);
  } else {
    for (let i = 0; i < 13; i++) {
      rect(ctx, 5 + i, 18 - i, 3, 2, i < 4 ? P.wood[2] : P.ivory);
    }
    rect(ctx, 6, 14, 5, 2, P.wood[2]);
  }
  return canvas;
}
