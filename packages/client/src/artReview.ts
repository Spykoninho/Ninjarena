// Local art review uses the real renderer and map, without a multiplayer session.
import { DEFAULT_CHARACTER_ID, DEFAULT_MAP_ID, loadContent, loadMap } from '@ninjarena/content';
import { PixiRenderer } from './rendering/pixiRenderer';
import type { PlayerView, RenderFrame } from './rendering/renderer';
import { drawIconSheet, drawPoseSheet, showcasePlayers, showcaseProjectiles } from './poseReview';
import './styles.css';
import { Hud } from './ui/hud';
import { KeyBindingsPanel } from './ui/keyBindingsPanel';
import { abilityOption, basicOptions, slotBindings, techniqueOptions } from './ui/loadoutModel';
import { LoadoutPanel } from './ui/loadoutPanel';
import { BindingsStore } from './input/bindingsStore';
import type { HudView } from './ui/hud';
import { minimapTerrain } from './game/hudView';

const stage = document.querySelector<HTMLElement>('#stage');
if (!stage) throw new Error('Missing review stage');
const content = loadContent(),
  renderer = new PixiRenderer({ zoom: 4 });
await renderer.init(stage);
const reviewMap = loadMap(content, DEFAULT_MAP_ID);
renderer.setMap(reviewMap, content.tilesets.get('default'));
const reviewTerrain = minimapTerrain(reviewMap, content.tilesets.get('default'));
const views = {
  dojo: { camera: { x: 208, y: 90 }, player: { x: 195, y: 113 } },
  forest: { camera: { x: 160, y: 185 }, player: { x: 77, y: 172 } },
  river: { camera: { x: 352, y: 120 }, player: { x: 379, y: 152 } },
  decor: { camera: { x: 280, y: 300 }, player: { x: 258, y: 330 } },
  poses: { camera: { x: 256, y: 200 }, player: { x: 150, y: 150 } },
};
let view: keyof typeof views = 'dojo';
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-view]')) {
  button.addEventListener('click', () => {
    const key = button.dataset.view;
    if (key === undefined || !(key in views)) return;
    view = key as keyof typeof views;
    for (const other of document.querySelectorAll('button[data-view]'))
      other.setAttribute('aria-pressed', String(other === button));
  });
}
const sheet = document.querySelector<HTMLCanvasElement>('#sheet');
if (sheet) drawPoseSheet(sheet);
const icons = document.querySelector<HTMLCanvasElement>('#icons');
if (icons) drawIconSheet(icons, content.abilities.all());
const hudRoot = document.querySelector<HTMLElement>('#hud');
const bindings = new BindingsStore(null);
const ninja = content.characters.get(DEFAULT_CHARACTER_ID);
const loadoutPanel = new LoadoutPanel(
  content.statRules,
  ninja.baseStats,
  techniqueOptions(content.abilities),
  basicOptions(content.abilities),
  abilityOption(content.abilities.get(ninja.dashId)),
  slotBindings(bindings.current, content.statRules.techniqueSlots),
);
const hud =
  hudRoot === null ? null : new Hud(hudRoot, new KeyBindingsPanel(bindings), loadoutPanel);
const started = performance.now();
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
    players: view === 'poses' ? [player, ...showcasePlayers({ x: 180, y: 160 }, now)] : [player],
    projectiles: view === 'poses' ? showcaseProjectiles({ x: 190, y: 290 }, now) : [],
    zones: [],
    obstacles: [],
    isFfa: false,
  };
  renderer.render(frame, Math.min(100, now - previous));
  hud?.update(reviewHud(now - started));
  previous = now;
  frameId = requestAnimationFrame(draw);
}
frameId = requestAnimationFrame(draw);
const HEALTH_BEATS = [100, 84, 63, 41, 22];
const COOLDOWN_CYCLE_MS = 3200;
const COOLDOWN_MS = 2200;
const ROUND_SECONDS = 90;

// Le HUD de revue rejoue seul les états que réclame une relecture: dégâts, recharge, manque et verrou.
function reviewHud(elapsedMs: number): HudView {
  const chakra = Math.round(50 + 50 * Math.cos(elapsedMs / 2200));
  const health = HEALTH_BEATS[Math.floor(elapsedMs / 1800) % HEALTH_BEATS.length] ?? 100;
  const cooling = Math.max(0, COOLDOWN_MS - (elapsedMs % COOLDOWN_CYCLE_MS));
  const seconds = ROUND_SECONDS - (Math.floor(elapsedMs / 1000) % (ROUND_SECONDS + 1));
  return {
    health,
    maxHealth: 100,
    chakra,
    maxChakra: 100,
    shield: health < 50 ? 18 : 0,
    watching: false,
    abilities: [
      { name: 'Slash', family: 'melee', binding: 'LMB', chakraCost: 0, ...ready() },
      {
        name: 'Shadow step',
        family: 'dash',
        binding: 'SPC',
        chakraCost: 10,
        reason: null,
        available: true,
        remainingMs: cooling,
        cooldownMs: COOLDOWN_MS,
      },
      {
        name: 'Fireball',
        family: 'projectile',
        binding: 'RMB',
        chakraCost: 25,
        reason: chakra < 25 ? 'chakra' : null,
        available: chakra >= 25,
        remainingMs: 0,
        cooldownMs: 4000,
      },
      {
        name: 'Earth wall',
        family: 'wall',
        binding: 'E',
        chakraCost: 30,
        reason: 'control',
        available: false,
        remainingMs: 0,
        cooldownMs: 9000,
      },
      { name: 'Ward', family: 'defense', binding: 'R', chakraCost: 20, ...ready() },
    ],
    matchPhase: elapsedMs < 600 ? 'COUNTDOWN' : 'IN_ROUND',
    round: 4,
    scores: { 'team-0': 2, 'team-1': 1 },
    roundTimer: `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`,
    buildSummary: 'VIT 2 · STR 1 · POW 3 · SPD 0 · CHK 1 · REG 0 · DEF 1',
    status: 'Art review — fake data',
    rttMs: 24,
    spectating: null,
    teamId: 'team-0',
    teamCode: 0,
    skin: 1,
    minimap: {
      terrain: reviewTerrain,
      markers: [
        {
          id: 'foe',
          name: 'Kaede',
          teamCode: 1,
          isLocal: false,
          x: 320 + 120 * Math.cos(elapsedMs / 1600),
          y: 240 + 80 * Math.sin(elapsedMs / 1600),
        },
        { id: 'me', name: 'Ryu', teamCode: 0, isLocal: true, x: 195, y: 113 },
      ],
    },
  };
}

function ready() {
  return { reason: null, available: true, remainingMs: 0, cooldownMs: 6000 } as const;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(frameId);
  renderer.dispose();
}
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
