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
