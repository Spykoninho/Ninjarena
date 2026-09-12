export interface InputBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  abilities: [string, string, string, string, string];
  spectateNext: string;
}

// Les codes physiques rendent ZQSD et WASD identiques sans réglage.
export const DEFAULT_BINDINGS: InputBindings = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  abilities: ['Mouse0', 'Space', 'Mouse2', 'KeyE', 'KeyR'],
  spectateNext: 'Tab',
};

const KEY_PREFIX = 'Key';

const BINDING_LABELS: Record<string, string> = {
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Space: 'SPC',
};

// Une pastille du HUD n'a la place que d'une étiquette courte: `KeyE` s'y affiche `E`.
export function bindingLabel(binding: string): string {
  const known = BINDING_LABELS[binding];
  if (known !== undefined) return known;
  return binding.startsWith(KEY_PREFIX) ? binding.slice(KEY_PREFIX.length) : binding;
}
