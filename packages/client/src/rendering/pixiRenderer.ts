import type { LoadedMap, TilesetDefinition, Vec2 } from '@ninjarena/core';
import { Application, Container, Graphics, TextureStyle } from 'pixi.js';
import { EntityLayer } from './entityLayer';
import type { RenderFrame, Renderer } from './renderer';

const BACKGROUND_COLOR = '#101014';
const EMPTY_TILE_ID = -1;

export class PixiRenderer implements Renderer {
  private readonly zoom: number;
  private readonly worldContainer = new Container();
  private readonly entityLayer = new EntityLayer();
  private app: Application | null = null;
  private mapLayer: Container | null = null;

  constructor(options: { zoom: number }) {
    this.zoom = options.zoom;
  }

  async init(container: HTMLElement): Promise<void> {
    // Le filtrage doit être choisi avant la première texture: sinon les tuiles sortent floues.
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    const app = new Application();
    await app.init({
      resizeTo: container,
      antialias: false,
      resolution: 1,
      roundPixels: true,
      background: BACKGROUND_COLOR,
    });
    container.appendChild(app.canvas);
    this.worldContainer.scale.set(this.zoom);
    this.worldContainer.addChild(this.entityLayer.container);
    app.stage.addChild(this.worldContainer);
    this.app = app;
  }

  setMap(map: LoadedMap, tileset: TilesetDefinition): void {
    const layer = new Container();
    layer.addChild(tileLayer(map, tileset, (tx, ty) => map.groundTileIdAt(tx, ty)));
    layer.addChild(tileLayer(map, tileset, (tx, ty) => map.objectTileIdAt(tx, ty)));
    this.mapLayer?.destroy({ children: true });
    this.worldContainer.addChildAt(layer, 0);
    this.mapLayer = layer;
  }

  render(frame: RenderFrame): void {
    const app = this.app;
    if (app === null) return;
    this.worldContainer.position.set(
      Math.round(app.screen.width / 2 - frame.camera.x * this.zoom),
      Math.round(app.screen.height / 2 - frame.camera.y * this.zoom),
    );
    this.entityLayer.sync(frame);
  }

  worldToScreen(position: Vec2): Vec2 {
    return {
      x: this.worldContainer.position.x + position.x * this.zoom,
      y: this.worldContainer.position.y + position.y * this.zoom,
    };
  }

  dispose(): void {
    this.entityLayer.clear();
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
    this.mapLayer = null;
  }
}

function tileLayer(
  map: LoadedMap,
  tileset: TilesetDefinition,
  tileIdAt: (tx: number, ty: number) => number,
): Graphics {
  const g = new Graphics();
  const size = map.tileSize;
  for (let ty = 0; ty < map.heightInTiles; ty++) {
    for (let tx = 0; tx < map.widthInTiles; tx++) {
      const id = tileIdAt(tx, ty);
      if (id === EMPTY_TILE_ID) continue;
      const tile = tileset.tiles[String(id)];
      if (tile === undefined) continue;
      g.rect(tx * size, ty * size, size, size).fill(tile.color);
    }
  }
  return g;
}
