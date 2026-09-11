import type { Rect } from './shapes';

export function mergeSolidTiles(
  solid: readonly boolean[],
  width: number,
  height: number,
  tileSize: number,
): Rect[] {
  const rects: Rect[] = [];
  // Les runs de la ligne précédente, indexés par "début:fin", pour les étendre vers le bas.
  let openAbove = new Map<string, Rect>();
  for (let ty = 0; ty < height; ty++) {
    const open = new Map<string, Rect>();
    let tx = 0;
    while (tx < width) {
      if (!solid[ty * width + tx]) {
        tx++;
        continue;
      }
      const start = tx;
      while (tx < width && solid[ty * width + tx]) tx++;
      const key = `${start}:${tx}`;
      const above = openAbove.get(key);
      if (above) {
        above.height += tileSize;
        open.set(key, above);
      } else {
        const rect: Rect = {
          type: 'rect',
          x: start * tileSize,
          y: ty * tileSize,
          width: (tx - start) * tileSize,
          height: tileSize,
        };
        rects.push(rect);
        open.set(key, rect);
      }
    }
    openAbove = open;
  }
  return rects;
}
