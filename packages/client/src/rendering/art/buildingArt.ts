export { buildingCanvas, buildingGeometry } from './volumeArt';

export function buildingRectangle(
  x: number,
  y: number,
  isBuilding: (x: number, y: number) => boolean,
  claimed: ReadonlySet<string>,
): { width: number; height: number } {
  let width = 0;
  while (isBuilding(x + width, y) && !claimed.has(`${x + width}:${y}`)) width++;
  if (width === 0) return { width: 0, height: 0 };
  let height = 1;
  outer: for (; ; height++) {
    for (let dx = 0; dx < width; dx++)
      if (!isBuilding(x + dx, y + height) || claimed.has(`${x + dx}:${y + height}`)) break outer;
  }
  return { width, height };
}
