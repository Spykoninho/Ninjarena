import { clampLength } from '@ninjarena/core';
import type { Vec2 } from '@ninjarena/core';
import type { AimDrag, TouchState } from '../input/touchInput';
import { aimDrag, queueFire, resetTouchState, stickVector } from '../input/touchInput';
import { pen } from '../rendering/art/nativeArt';
import { ART_SCALE } from '../rendering/art/presentation';
import type { HudAbilityView, HudView } from './hud';
import { HudAbilitySlot } from './hud';
import { paintAimGuide } from './touchGuide';

// Position écran du joueur en pixels CSS: le guide de visée part de là.
export interface TouchGuideFrame {
  player: Vec2 | null;
  pixelsPerUnit: number;
}

const SLOT_COUNT = 5;
const STICK_RADIUS = 40;
const STICK_DEAD_ZONE = 12;
const AIM_RADIUS = 72;
const AIM_DEAD_ZONE = 16;

export class TouchControls {
  readonly root: HTMLElement;
  readonly state: TouchState;
  private readonly guide: AimGuide;
  private readonly stick: Stick;
  private readonly buttons: AttackButton[];
  private readonly next: HTMLButtonElement;
  private playing = true;

  constructor(state: TouchState, nextTarget: () => void) {
    this.state = state;
    this.root = document.createElement('div');
    this.root.className = 'hud touch';
    this.root.hidden = true;
    this.guide = new AimGuide(this.root);
    this.stick = new Stick(this.root, state);
    this.buttons = Array.from(
      { length: SLOT_COUNT },
      (_, slot) => new AttackButton(this.root, state, slot),
    );
    this.next = button(this.root, 'touch-next hud-ink', 'Joueur suivant', nextTarget);
    element('p', 'touch-rotate hud-ink', this.root).textContent =
      'Tourne ton téléphone : le combat se joue en paysage';
    this.root.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.release();
  }

  update(view: HudView, frame: TouchGuideFrame): void {
    // Un spectateur n'a personne à piloter: il ne garde que le bouton qui change de cible.
    const playing = !view.watching && view.spectating === null;
    if (this.playing !== playing) {
      this.playing = playing;
      this.root.classList.toggle('is-spectating', !playing);
      if (!playing) this.release();
    }
    const hidden = view.spectating === null;
    if (this.next.hidden !== hidden) this.next.hidden = hidden;
    this.buttons.forEach((attack, slot) => {
      attack.update(view.abilities[slot]);
    });
    this.guide.paint(this.state, frame);
  }

  private release(): void {
    resetTouchState(this.state);
    this.stick.release();
    for (const attack of this.buttons) attack.release();
  }
}

class Stick {
  private readonly state: TouchState;
  private readonly zone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private center: Vec2 = { x: 0, y: 0 };

  constructor(parent: HTMLElement, state: TouchState) {
    this.state = state;
    this.zone = element('div', 'touch-stick-zone', parent);
    this.base = element('div', 'touch-stick', this.zone);
    this.knob = element('div', 'touch-stick-knob', this.base);
    this.zone.addEventListener('pointerdown', this.onDown);
    this.zone.addEventListener('pointermove', this.onMove);
    this.zone.addEventListener('pointerup', this.onUp);
    this.zone.addEventListener('pointercancel', this.onUp);
    this.zone.addEventListener('lostpointercapture', this.onUp);
  }

  release(): void {
    this.pointerId = null;
    this.state.move = { x: 0, y: 0 };
    this.base.classList.remove('is-active');
    this.base.style.removeProperty('left');
    this.base.style.removeProperty('top');
    this.knob.style.removeProperty('transform');
  }

  // Le stick naît sous le pouce: nul besoin de viser un cercle précis pour marcher.
  private readonly onDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.zone.setPointerCapture(event.pointerId);
    const bounds = this.zone.getBoundingClientRect();
    this.center = { x: event.clientX, y: event.clientY };
    this.base.style.left = `${event.clientX - bounds.left}px`;
    this.base.style.top = `${event.clientY - bounds.top}px`;
    this.base.classList.add('is-active');
    this.follow(event);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.follow(event);
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.release();
  };

  private follow(event: PointerEvent): void {
    const offset = { x: event.clientX - this.center.x, y: event.clientY - this.center.y };
    this.state.move = stickVector(offset, STICK_DEAD_ZONE);
    const knob = clampLength(offset, STICK_RADIUS);
    this.knob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  }
}

// Un bouton d'attaque: une frappe sèche vise seule, un glissé vise à la main, un retour au centre annule.
class AttackButton {
  private readonly state: TouchState;
  private readonly slotIndex: number;
  private readonly root: HTMLElement;
  private readonly slot: HudAbilitySlot;
  private readonly knob: HTMLElement;
  private ability: HudAbilityView | undefined;
  private pointerId: number | null = null;
  private center: Vec2 = { x: 0, y: 0 };
  private drag: AimDrag = { direction: null, reach: 0 };
  private aimed = false;
  private instant = false;

  constructor(parent: HTMLElement, state: TouchState, slotIndex: number) {
    this.state = state;
    this.slotIndex = slotIndex;
    this.root = element('div', 'touch-button', parent);
    this.root.dataset.slot = String(slotIndex);
    this.root.hidden = true;
    const ring = element('div', 'touch-aim', this.root);
    this.knob = element('div', 'touch-aim-knob', ring);
    this.slot = new HudAbilitySlot(this.root);
    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onCancel);
    this.root.addEventListener('lostpointercapture', this.onCancel);
  }

  update(ability: HudAbilityView | undefined): void {
    this.ability = ability;
    const hidden = ability === undefined;
    if (this.root.hidden !== hidden) this.root.hidden = hidden;
    this.slot.update(ability);
  }

  release(): void {
    if (this.state.aiming?.slot === this.slotIndex) this.state.aiming = null;
    this.pointerId = null;
    this.root.classList.remove('is-pressed', 'is-aiming', 'is-cancel');
    this.knob.style.removeProperty('transform');
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || this.ability === undefined) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    const bounds = this.root.getBoundingClientRect();
    this.center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    this.drag = { direction: null, reach: 0 };
    this.aimed = false;
    this.root.classList.add('is-pressed');
    const shape = this.state.slots[this.slotIndex]?.shape;
    // Rien à viser: le coup part dès que le doigt se pose.
    this.instant = shape === undefined || shape.kind === 'self';
    if (this.instant) queueFire(this.state, { slot: this.slotIndex, direction: null, reach: 0 });
    else this.state.aiming = { slot: this.slotIndex, ...this.drag };
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || this.instant) return;
    const offset = { x: event.clientX - this.center.x, y: event.clientY - this.center.y };
    this.drag = aimDrag(offset, AIM_RADIUS, AIM_DEAD_ZONE);
    if (this.drag.direction !== null) this.aimed = true;
    this.state.aiming = { slot: this.slotIndex, ...this.drag };
    this.root.classList.toggle('is-aiming', this.drag.direction !== null);
    this.root.classList.toggle('is-cancel', this.aimed && this.drag.direction === null);
    const knob = clampLength(offset, AIM_RADIUS);
    this.knob.style.transform = `translate(${knob.x}px, ${knob.y}px)`;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const cancelled = this.aimed && this.drag.direction === null;
    if (!this.instant && !cancelled) queueFire(this.state, { slot: this.slotIndex, ...this.drag });
    this.release();
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.release();
  };
}

class AimGuide {
  private readonly canvas: HTMLCanvasElement;
  private zoom = 0;
  private painted = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'touch-guide';
    parent.appendChild(this.canvas);
  }

  paint(state: TouchState, frame: TouchGuideFrame): void {
    const aiming = state.aiming;
    const shape = aiming === null ? undefined : state.slots[aiming.slot]?.shape;
    const direction = aiming?.direction ?? null;
    if (this.painted) pen(this.canvas).clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.painted = false;
    if (aiming === null || direction === null || shape === undefined || frame.player === null) {
      return;
    }
    // Le guide suit le zoom entier du rendu: ses pixels ont la taille de ceux du décor.
    const zoom = Math.max(1, Math.round(frame.pixelsPerUnit / ART_SCALE));
    this.fit(zoom);
    const origin = { x: frame.player.x / zoom, y: frame.player.y / zoom };
    paintAimGuide(pen(this.canvas), origin, shape, direction, aiming.reach);
    this.painted = true;
  }

  private fit(zoom: number): void {
    const width = Math.ceil(window.innerWidth / zoom);
    const height = Math.ceil(window.innerHeight / zoom);
    if (this.zoom === zoom && this.canvas.width === width && this.canvas.height === height) return;
    this.zoom = zoom;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width * zoom}px`;
    this.canvas.style.height = `${height * zoom}px`;
  }
}

function button(
  parent: HTMLElement,
  className: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', onClick);
  parent.appendChild(node);
  return node;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
