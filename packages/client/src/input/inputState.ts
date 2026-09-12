import type { Vec2 } from '@ninjarena/core';

export interface InputState {
  keysDown: Set<string>;
  buttonsDown: Set<number>;
  mouseScreen: Vec2;
  // Front montant des touches: rempli à l'appui, vidé une fois par image par ClientGame.
  pressedOnce: Set<string>;
}

export function createInputState(): InputState {
  return {
    keysDown: new Set<string>(),
    buttonsDown: new Set<number>(),
    mouseScreen: { x: 0, y: 0 },
    pressedOnce: new Set<string>(),
  };
}
