export const packed: string[];
export const TORII: string[];
export const FENCE_FRAME: number;
export const TORII_FRAME: number;
export const TORII_LINTEL_HEIGHT: number;
export function pathTile(
  variant?: number,
  neighbors?: number,
  worldX?: number,
  worldY?: number,
): HTMLCanvasElement;
export function flowersTile(variant?: number, worldX?: number, worldY?: number): HTMLCanvasElement;
export function lanternCanvas(): HTMLCanvasElement;
export function rockCanvas(variant?: number): HTMLCanvasElement;
export function fenceCanvas(mask?: number, mid?: boolean): HTMLCanvasElement;
export function wellCanvas(): HTMLCanvasElement;
export function crateCanvas(variant?: number): HTMLCanvasElement;
export function toriiPostsCanvas(span?: number): HTMLCanvasElement;
export function toriiLintelCanvas(span?: number): HTMLCanvasElement;
