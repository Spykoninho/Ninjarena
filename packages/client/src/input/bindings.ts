export interface InputBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  abilities: [string, string, string, string, string];
  spectateNext: string;
  fullscreen: string;
}

// Les codes physiques rendent ZQSD et WASD identiques sans réglage.
export const DEFAULT_BINDINGS: InputBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  abilities: ['Mouse0', 'Space', 'Mouse2', 'KeyE', 'KeyR'],
  spectateNext: 'Tab',
  fullscreen: 'KeyF',
};

const KEY_PREFIX = 'Key';

const BINDING_LABELS: Record<string, string> = {
  Mouse0: 'Clic gauche',
  Mouse1: 'Molette',
  Mouse2: 'Clic droit',
  Space: 'Espace',
};

// Une pastille du HUD n'a la place que de trois lettres: `Clic gauche` y devient `CLG`.
const SHORT_BINDING_LABELS: Record<string, string> = {
  Mouse0: 'CLG',
  Mouse1: 'MOL',
  Mouse2: 'CLD',
  Space: 'ESP',
};

export function bindingLabel(binding: string): string {
  return BINDING_LABELS[binding] ?? keyName(binding);
}

export function shortBindingLabel(binding: string): string {
  return SHORT_BINDING_LABELS[binding] ?? keyName(binding);
}

function keyName(binding: string): string {
  return binding.startsWith(KEY_PREFIX) ? binding.slice(KEY_PREFIX.length) : binding;
}
