export interface FullscreenDocument {
  fullscreenElement: Element | null;
  exitFullscreen(): Promise<void>;
}

export interface FullscreenTarget {
  requestFullscreen(): Promise<void>;
}

// Le plein écran garde la souris dans le jeu: plus de clic perdu sur un onglet ou la barre d'adresse.
export function toggleFullscreen(
  doc: FullscreenDocument = document,
  target: FullscreenTarget = document.documentElement,
): Promise<void> {
  const request =
    doc.fullscreenElement === null ? target.requestFullscreen() : doc.exitFullscreen();
  return request.catch(() => {});
}

// L'iPhone réserve l'API aux vidéos: sans elle, c'est l'écran d'accueil qui ouvre le jeu sans barres.
export function enterFullscreen(
  doc: FullscreenDocument = document,
  target: Partial<FullscreenTarget> = document.documentElement,
): Promise<void> {
  if (doc.fullscreenElement !== null || target.requestFullscreen === undefined) {
    return Promise.resolve();
  }
  return target.requestFullscreen().catch(() => {});
}

export function isFullscreenShortcut(event: KeyboardEvent, binding: string): boolean {
  if (event.code !== binding || event.repeat) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return !isTextField(event.target);
}

// Testé sous node: la cible est reconnue par sa forme, sans supposer un `HTMLElement` global.
function isTextField(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object' || !('closest' in target)) return false;
  return (target as Element).closest('input, select, textarea') !== null;
}
