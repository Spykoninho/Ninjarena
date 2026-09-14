export type Ramp = [string, string, string];
export type Direction = 'n' | 's' | 'e' | 'w';
export type Layer = 'Body' | 'Clothes' | 'Hair' | 'Headgear' | 'Accessory' | 'Weapon';
export interface NinjaOptions {
  direction?: Direction;
  cloth?: Ramp;
  skin?: Ramp;
  step?: number;
  layer?: Layer | null;
  weapon?: boolean;
  hat?: boolean;
}
export const P: {
  ink: string;
  ui: string;
  edge: string;
  indigo: Ramp;
  stone: Ramp;
  green: Ramp;
  water: Ramp;
  wood: Ramp;
  skin: Ramp;
  darkSkin: Ramp;
  ivory: string;
  danger: string;
  gold: string;
  cyan: string;
  violet: string;
  mint: string;
  landscape: Record<
    'soil' | 'sand' | 'grass' | 'leaf' | 'shade' | 'shallows' | 'foam' | 'deep',
    string
  >;
};
export const teams: string[];
export function surface(w: number, h: number): HTMLCanvasElement;
export function pen(c: HTMLCanvasElement): CanvasRenderingContext2D;
export function rect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void;
export function line(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  xx: number,
  yy: number,
  color: string,
): void;
export function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  outline?: boolean,
): void;
export function poly(c: CanvasRenderingContext2D, points: number[][], color: string): void;
export function text(
  c: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  color?: string,
  size?: number,
): void;
export function blit(
  c: CanvasRenderingContext2D,
  s: HTMLCanvasElement,
  x: number,
  y: number,
  scale?: number,
): void;
export function ninja(options?: NinjaOptions): HTMLCanvasElement;
export function tile(kind: string, variant?: number): HTMLCanvasElement;
export function symbol(
  c: CanvasRenderingContext2D,
  id: number,
  x: number,
  y: number,
  color: string,
): void;
export function marker(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  id: number,
  local?: boolean,
): void;
export function ring(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color?: string,
  active?: boolean,
): void;
export function brackets(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  size?: number,
): void;
export function chevron(c: CanvasRenderingContext2D, x: number, y: number, color: string): void;
export function impact(c: CanvasRenderingContext2D, x: number, y: number, color?: string): void;
export function shield(c: CanvasRenderingContext2D, x: number, y: number, active?: boolean): void;
export function portal(c: CanvasRenderingContext2D, x: number, y: number, active?: boolean): void;
export function ability(
  c: CanvasRenderingContext2D,
  id: number,
  x: number,
  y: number,
  active: boolean,
): void;
export function hash(x: number, y: number): number;
export function slab(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant?: number,
): void;
export function tuft(c: CanvasRenderingContext2D, x: number, y: number, tone?: string): void;
export function bush(c: CanvasRenderingContext2D, x: number, y: number, size?: number): void;
export function tree(c: CanvasRenderingContext2D, x: number, y: number, variant?: number): void;
export function lantern(c: CanvasRenderingContext2D, x: number, y: number): void;
