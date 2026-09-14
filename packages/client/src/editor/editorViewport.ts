// La vue est un simple repère: la carte se dessine à l'échelle 1, la transformation CSS fait le reste.
export interface ViewTransform {
  zoom: number;
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

// Les barres en surimpression mordent sur la vue: le cadrage ne compte que la bande libre.
export interface ViewInset {
  top: number;
  bottom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 6;
const FIT_MARGIN = 0.9;
const NO_INSET: ViewInset = { top: 0, bottom: 0 };

export function fitView(
  viewport: ViewportSize,
  mapWidth: number,
  mapHeight: number,
  inset: ViewInset = NO_INSET,
): ViewTransform {
  const free = { width: viewport.width, height: viewport.height - inset.top - inset.bottom };
  if (free.width <= 0 || free.height <= 0 || mapWidth <= 0 || mapHeight <= 0) {
    return { zoom: 1, x: 0, y: 0 };
  }
  const zoom = clampZoom(Math.min(free.width / mapWidth, free.height / mapHeight) * FIT_MARGIN);
  const centered = centerView(free, mapWidth, mapHeight, zoom);
  return { ...centered, y: centered.y + inset.top };
}

export function centerView(
  viewport: ViewportSize,
  mapWidth: number,
  mapHeight: number,
  zoom: number,
): ViewTransform {
  return {
    zoom,
    x: (viewport.width - mapWidth * zoom) / 2,
    y: (viewport.height - mapHeight * zoom) / 2,
  };
}

// Le point sous le curseur reste fixe: l'origine glisse pour compenser le changement d'échelle.
export function zoomAt(
  view: ViewTransform,
  factor: number,
  pointerX: number,
  pointerY: number,
): ViewTransform {
  const zoom = clampZoom(view.zoom * factor);
  const ratio = zoom / view.zoom;
  return {
    zoom,
    x: pointerX - (pointerX - view.x) * ratio,
    y: pointerY - (pointerY - view.y) * ratio,
  };
}

export function panBy(view: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

export function centerOn(
  view: ViewTransform,
  viewport: ViewportSize,
  pointX: number,
  pointY: number,
): ViewTransform {
  return {
    ...view,
    x: viewport.width / 2 - pointX * view.zoom,
    y: viewport.height / 2 - pointY * view.zoom,
  };
}

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}

function clampZoom(zoom: number): number {
  const finite = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finite));
}
