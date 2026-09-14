import { shrubCanvas } from '../rendering/art/landscapeArt';
import type { MapDocument, MapSpawn, TilesetDefinition } from '@ninjarena/core';
import { hash, tile } from '../rendering/art/nativeArt';
import {
  cardinalMask,
  decorFloorCanvas,
  decorObjectCanvas,
  isDecorFloor,
} from '../rendering/decorArt';
import { terrainCanvas, neighborMask } from '../rendering/art/terrainArt';
import type { EditorState } from './editorModel';

export interface TileCoordinates {
  x: number;
  y: number;
}

const UNKNOWN_COLOR = '#ff00ff';
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const ISSUE_COLOR = '#ff5a5a';
const HIGHLIGHT_COLOR = '#ffd34a';
const SPAWN_FILL = '#f4f4f8';
const SPAWN_TEXT = '#14141a';
const SPAWN_RADIUS_RATIO = 0.36;
const SPAWN_FONT_RATIO = 0.62;

export class MapCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly tileset: TilesetDefinition;
  private readonly pixelsPerTile: number;
  private readonly textures = new Map<string, HTMLCanvasElement>();
  private columns = 0;
  private rows = 0;
  private highlight: TileCoordinates | null = null;

  constructor(canvas: HTMLCanvasElement, tileset: TilesetDefinition, pixelsPerTile: number) {
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('the map editor needs a 2d canvas context');
    this.canvas = canvas;
    this.context = context;
    context.imageSmoothingEnabled = false;
    this.tileset = tileset;
    this.pixelsPerTile = pixelsPerTile;
  }

  setHighlight(tile: TileCoordinates | null): void {
    this.highlight = tile;
  }

  draw(state: EditorState): void {
    const { document } = state;
    this.resize(document);
    this.drawTiles(document);
    this.drawGrid();
    this.drawIssues(state);
    for (const spawn of document.spawns) this.drawSpawn(spawn);
    this.drawHighlight();
  }

  // Le pointeur parle en pixels CSS: la taille affichée peut différer de la résolution du canevas.
  tileAt(clientX: number, clientY: number): TileCoordinates | null {
    if (this.columns === 0 || this.rows === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * this.columns);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.rows);
    if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) return null;
    return { x, y };
  }

  private resize(document: MapDocument): void {
    const width = document.width * this.pixelsPerTile;
    const height = document.height * this.pixelsPerTile;
    this.columns = document.width;
    this.rows = document.height;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.style.width = `${String(width)}px`;
    this.canvas.style.height = `${String(height)}px`;
    this.context.imageSmoothingEnabled = false;
    this.context.clearRect(0, 0, width, height);
  }

  private drawTiles(document: MapDocument): void {
    const size = this.pixelsPerTile;
    for (let y = 0; y < document.height; y++) {
      const ground = document.layers.ground[y] ?? [];
      const objects = document.layers.objects[y] ?? [];
      for (let x = 0; x < document.width; x++) {
        const groundId = ground[x] ?? null;
        const info = this.tileset.tiles[String(groundId)];
        const variant = hash(x, y) % 12;
        const mask = neighborMask(x, y, (xx, yy) => document.layers.ground[yy]?.[xx] === groundId);
        const key = `${groundId}:${x}:${y}:${mask}`;
        let image = this.textures.get(key);
        if (!image) {
          const name = info?.name ?? 'ground';
          image = isDecorFloor(name)
            ? decorFloorCanvas(name, variant, mask, x * 32, y * 32)
            : terrainCanvas(name, variant, mask, 0, this.colorOf(groundId), x * 32, y * 32);
          this.textures.set(key, image);
        }
        this.context.drawImage(image, x * size, y * size, size, size);
        const object = objects[x] ?? null;
        if (object !== null) {
          const objectInfo = this.tileset.tiles[String(object)],
            objectName = objectInfo?.name ?? 'wall',
            objectMask = cardinalMask(
              (xx, yy) => document.layers.objects[yy]?.[xx] === object,
              x,
              y,
            ),
            objectKey = `object:${object}:${objectMask}`;
          let objectImage = this.textures.get(objectKey);
          if (!objectImage) {
            objectImage =
              decorObjectCanvas(objectName, variant, objectMask) ??
              (objectName === 'bush' ? shrubCanvas() : tile(objectName));
            this.textures.set(objectKey, objectImage);
          }
          this.context.drawImage(objectImage, x * size, y * size, size, size);
        }
      }
    }
  }

  private drawGrid(): void {
    const size = this.pixelsPerTile;
    this.context.strokeStyle = GRID_COLOR;
    this.context.lineWidth = 1;
    this.context.beginPath();
    for (let x = 0; x <= this.columns; x++) {
      this.context.moveTo(x * size + 0.5, 0);
      this.context.lineTo(x * size + 0.5, this.rows * size);
    }
    for (let y = 0; y <= this.rows; y++) {
      this.context.moveTo(0, y * size + 0.5);
      this.context.lineTo(this.columns * size, y * size + 0.5);
    }
    this.context.stroke();
  }

  private drawIssues(state: EditorState): void {
    this.context.strokeStyle = ISSUE_COLOR;
    this.context.lineWidth = 1;
    for (const issue of state.issues) {
      if (issue.x === undefined || issue.y === undefined) continue;
      this.strokeTile(issue.x, issue.y, 0.5);
    }
  }

  private drawSpawn(spawn: MapSpawn): void {
    const size = this.pixelsPerTile;
    const centerX = (spawn.x + 0.5) * size;
    const centerY = (spawn.y + 0.5) * size;
    this.context.fillStyle = SPAWN_FILL;
    this.context.beginPath();
    this.context.arc(centerX, centerY, size * SPAWN_RADIUS_RATIO, 0, Math.PI * 2);
    this.context.fill();
    this.context.fillStyle = SPAWN_TEXT;
    this.context.font = `${String(Math.round(size * SPAWN_FONT_RATIO))}px monospace`;
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    this.context.fillText(
      spawn.team === undefined ? '*' : String(spawn.team + 1),
      centerX,
      centerY,
    );
  }

  private drawHighlight(): void {
    const tile = this.highlight;
    if (tile === null) return;
    this.context.strokeStyle = HIGHLIGHT_COLOR;
    this.context.lineWidth = 2;
    this.strokeTile(tile.x, tile.y, 1);
  }

  private strokeTile(x: number, y: number, inset: number): void {
    const size = this.pixelsPerTile;
    this.context.strokeRect(x * size + inset, y * size + inset, size - inset * 2, size - inset * 2);
  }

  private colorOf(id: number | null): string {
    if (id === null) return UNKNOWN_COLOR;
    return this.tileset.tiles[String(id)]?.color ?? UNKNOWN_COLOR;
  }
}
