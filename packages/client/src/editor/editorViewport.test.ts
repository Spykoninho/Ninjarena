import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  centerOn,
  fitView,
  panBy,
  wheelZoomFactor,
  zoomAt,
} from './editorViewport';

const VIEWPORT = { width: 1000, height: 600 };

describe('fitView', () => {
  it('fits the map inside the viewport with a margin and centers it', () => {
    const view = fitView(VIEWPORT, 800, 400);
    expect(view.zoom).toBeCloseTo(1.125);
    expect(view.x).toBeCloseTo((1000 - 800 * 1.125) / 2);
    expect(view.y).toBeCloseTo((600 - 400 * 1.125) / 2);
  });

  it('uses the tighter axis so a tall map never overflows', () => {
    const view = fitView(VIEWPORT, 100, 1200);
    expect(view.zoom).toBeCloseTo(0.45);
  });

  it('clamps the zoom to the allowed range', () => {
    expect(fitView(VIEWPORT, 10, 10).zoom).toBe(MAX_ZOOM);
    expect(fitView(VIEWPORT, 100000, 100000).zoom).toBe(MIN_ZOOM);
  });

  it('fits inside the band left free by the overlaid bars', () => {
    const view = fitView(VIEWPORT, 800, 400, { top: 100, bottom: 100 });
    expect(view.zoom).toBeCloseTo(0.9);
    expect(view.y).toBeCloseTo(100 + (400 - 400 * 0.9) / 2);
  });

  it('falls back to the identity when the viewport has no size yet', () => {
    expect(fitView({ width: 0, height: 0 }, 800, 400)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe('zoomAt', () => {
  it('keeps the point under the pointer fixed', () => {
    const view = { zoom: 1, x: 100, y: 50 };
    const pointer = { x: 300, y: 250 };
    const mapPoint = { x: (pointer.x - view.x) / view.zoom, y: (pointer.y - view.y) / view.zoom };
    const zoomed = zoomAt(view, 2, pointer.x, pointer.y);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x + mapPoint.x * zoomed.zoom).toBeCloseTo(pointer.x);
    expect(zoomed.y + mapPoint.y * zoomed.zoom).toBeCloseTo(pointer.y);
  });

  it('stops at the zoom bounds without moving the view', () => {
    const view = { zoom: MAX_ZOOM, x: 10, y: 20 };
    expect(zoomAt(view, 3, 0, 0)).toEqual(view);
    const far = { zoom: MIN_ZOOM, x: 10, y: 20 };
    expect(zoomAt(far, 0.1, 0, 0)).toEqual(far);
  });

  it('turns a wheel scroll up into a zoom in and down into a zoom out', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });
});

describe('panBy and centerOn', () => {
  it('translates the view without touching the zoom', () => {
    expect(panBy({ zoom: 2, x: 10, y: 20 }, 5, -5)).toEqual({ zoom: 2, x: 15, y: 15 });
  });

  it('brings a map point to the middle of the viewport', () => {
    const view = centerOn({ zoom: 2, x: 0, y: 0 }, VIEWPORT, 100, 50);
    expect(view.x + 100 * view.zoom).toBe(500);
    expect(view.y + 50 * view.zoom).toBe(300);
  });
});
