import type { InputState } from './inputState';

export class DomInputAdapter {
  private readonly target: HTMLElement;
  private readonly state: InputState;
  private attached = false;

  constructor(target: HTMLElement, state: InputState) {
    this.target = target;
    this.state = state;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.target.addEventListener('mousemove', this.onMouseMove);
    this.target.addEventListener('mousedown', this.onMouseDown);
    this.target.addEventListener('mouseup', this.onMouseUp);
    this.target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.clear();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Tab ne doit pas faire sortir le focus du canevas de jeu.
    if (event.code === 'Tab') event.preventDefault();
    if (event.repeat) return;
    this.state.keysDown.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.state.keysDown.delete(event.code);
  };

  // Un changement de fenêtre ne remonte aucun relâchement: tout est relâché de force.
  private readonly onBlur = (): void => {
    this.clear();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const bounds = this.target.getBoundingClientRect();
    this.state.mouseScreen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    this.state.buttonsDown.add(event.button);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.state.buttonsDown.delete(event.button);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private clear(): void {
    this.state.keysDown.clear();
    this.state.buttonsDown.clear();
  }
}
