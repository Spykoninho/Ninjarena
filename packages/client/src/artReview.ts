// Local art review uses the real renderer and map, without a multiplayer session.
import { DEFAULT_MAP_ID, loadContent, loadMap } from '@ninjarena/content';
import { PixiRenderer } from './rendering/pixiRenderer';
import type { PlayerView, RenderFrame } from './rendering/renderer';

const stage = document.querySelector<HTMLElement>('#stage');
if (!stage) throw new Error('Missing review stage');
const content = loadContent(),
  renderer = new PixiRenderer({ zoom: 4 });
await renderer.init(stage);
renderer.setMap(loadMap(content, DEFAULT_MAP_ID), content.tilesets.get('default'));
const views = {
  dojo: { camera: { x: 208, y: 90 }, player: { x: 195, y: 113 } },
  forest: { camera: { x: 160, y: 185 }, player: { x: 77, y: 172 } },
  river: { camera: { x: 352, y: 120 }, player: { x: 379, y: 152 } },
};
let view: keyof typeof views = 'dojo';
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-view]')) {
  button.addEventListener('click', () => {
    const key = button.dataset.view;
    if (key !== 'dojo' && key !== 'forest' && key !== 'river') return;
    view = key;
    for (const other of document.querySelectorAll('button[data-view]'))
      other.setAttribute('aria-pressed', String(other === button));
  });
}
let previous = performance.now();
let frameId = 0;
function draw(now: number) {
  const selected = views[view];
  const player: PlayerView = {
    id: 'art-scale',
    teamId: 'one',
    position: selected.player,
    aim: { x: 0, y: 1 },
    phase: 'NORMAL',
    isLocal: true,
    visible: true,
    healthRatio: 1,
    shieldRatio: 0,
    telegraph: null,
    activeArc: null,
    isDashing: false,
  };
  const frame: RenderFrame = {
    camera: selected.camera,
    players: [player],
    projectiles: [],
    zones: [],
    obstacles: [],
    isFfa: false,
  };
  renderer.render(frame, Math.min(100, now - previous));
  previous = now;
  frameId = requestAnimationFrame(draw);
}
frameId = requestAnimationFrame(draw);
let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(frameId);
  renderer.dispose();
}
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
