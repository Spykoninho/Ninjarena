export const earth: string[];
export const lawn: string[];
export function materialRelief(
  c: CanvasRenderingContext2D,
  kind: string,
  worldX: number,
  worldY: number,
): void;
export function shallowHollow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius?: number,
): void;
export function shrubCanvas(variant?: number): HTMLCanvasElement;
export function windCanvas(kind: string, phase: number, variant?: number): HTMLCanvasElement;
