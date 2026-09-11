import type { AABB } from './shapes';

export class SpatialGrid<T> {
  private readonly cells = new Map<string, T[]>();
  private count = 0;

  constructor(private readonly cellSize: number) {}

  insert(item: T, bounds: AABB): void {
    const minCellX = this.cellIndex(bounds.minX);
    const maxCellX = this.cellIndex(bounds.maxX);
    const minCellY = this.cellIndex(bounds.minY);
    const maxCellY = this.cellIndex(bounds.maxY);
    for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const key = `${cellX}:${cellY}`;
        const cell = this.cells.get(key);
        if (cell) cell.push(item);
        else this.cells.set(key, [item]);
      }
    }
    this.count++;
  }

  query(bounds: AABB): T[] {
    const minCellX = this.cellIndex(bounds.minX);
    const maxCellX = this.cellIndex(bounds.maxX);
    const minCellY = this.cellIndex(bounds.minY);
    const maxCellY = this.cellIndex(bounds.maxY);
    // Un Set conserve l'ordre d'insertion : le parcours ligne par ligne reste déterministe.
    const found = new Set<T>();
    for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const cell = this.cells.get(`${cellX}:${cellY}`);
        if (!cell) continue;
        for (const item of cell) found.add(item);
      }
    }
    return [...found];
  }

  get size(): number {
    return this.count;
  }

  private cellIndex(coordinate: number): number {
    return Math.floor(coordinate / this.cellSize);
  }
}
