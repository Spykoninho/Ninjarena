export interface BuildingGeometry {
  width: number;
  height: number;
  footX: number;
  footY: number;
  base: number;
  eave: number;
  rise: number;
  ridgeFront: number;
  ridgeBack: number;
  roofDepth: number;
}
export function buildingGeometry(width: number, depth: number): BuildingGeometry;
export function buildingCanvas(width: number, depth: number): HTMLCanvasElement;
export function treeTrunkCanvas(): HTMLCanvasElement;
export function treeCanopyCanvas(variant?: number): HTMLCanvasElement;
export function projectedTree(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  variant?: number,
): void;
