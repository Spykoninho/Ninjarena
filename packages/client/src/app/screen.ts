export type ScreenId = 'home' | 'lobby' | 'game' | 'editor';

export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}
