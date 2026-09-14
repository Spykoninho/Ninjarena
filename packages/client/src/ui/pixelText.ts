import { P, pen, surface, text } from '../rendering/art/nativeArt';

const GLYPH_HEIGHT = 7;
const GLYPH_ADVANCE = 6;
const STAMP_LIMIT = 256;

// Les timers produisent des chaînes volatiles: le cache est vidé plutôt que laissé grandir.
const stamps = new Map<string, HTMLCanvasElement>();

export function pixelTextWidth(value: string): number {
  return value.length === 0 ? 0 : value.length * GLYPH_ADVANCE - 1;
}

function stamp(value: string, color: string): HTMLCanvasElement {
  const key = `${color}|${value}`;
  const cached = stamps.get(key);
  if (cached !== undefined) return cached;
  const canvas = surface(Math.max(1, pixelTextWidth(value)), GLYPH_HEIGHT);
  if (value.length > 0) text(pen(canvas), value, 0, GLYPH_HEIGHT, color);
  if (stamps.size >= STAMP_LIMIT) stamps.clear();
  stamps.set(key, canvas);
  return canvas;
}

export interface PixelTextOptions {
  scale: number;
  color?: string;
  className?: string;
}

// Le canvas garde l'échelle 1 et laisse le CSS l'agrandir par entiers: le texte reste net.
export class PixelText {
  readonly canvas = document.createElement('canvas');
  private readonly scale: number;
  private color: string;
  private value: string | null = null;

  constructor(options: PixelTextOptions) {
    this.scale = options.scale;
    this.color = options.color ?? P.ivory;
    this.canvas.className = `hud-pixel-text ${options.className ?? ''}`.trim();
    this.set('');
  }

  set(value: string): void {
    if (this.value === value) return;
    this.value = value;
    this.paint();
  }

  setColor(color: string): void {
    if (this.color === color) return;
    this.color = color;
    this.paint();
  }

  private paint(): void {
    const source = stamp(this.value ?? '', this.color);
    const canvas = this.canvas;
    canvas.width = source.width;
    canvas.height = GLYPH_HEIGHT;
    pen(canvas).drawImage(source, 0, 0);
    canvas.style.width = `${source.width * this.scale}px`;
    canvas.style.height = `${GLYPH_HEIGHT * this.scale}px`;
    canvas.hidden = (this.value ?? '').length === 0;
  }
}
