import type { Vec2 } from '@ninjarena/core';

// La translation s'arrondit au pixel: une caméra fractionnaire ferait vibrer les tuiles.
export function cameraTranslation(camera: Vec2, zoom: number, viewport: Vec2): Vec2 {
  return {
    x: Math.round(viewport.x / 2 - camera.x * zoom),
    y: Math.round(viewport.y / 2 - camera.y * zoom),
  };
}
