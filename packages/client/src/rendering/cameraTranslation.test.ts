import { describe, expect, it } from 'vitest';
import { cameraTranslation } from './cameraTranslation';

describe('cameraTranslation', () => {
  it('centres the camera in the viewport', () => {
    expect(cameraTranslation({ x: 100, y: 50 }, 2, { x: 800, y: 600 })).toEqual({
      x: 200,
      y: 200,
    });
  });

  it('rounds to whole pixels', () => {
    expect(cameraTranslation({ x: 10.3, y: 10.7 }, 3, { x: 801, y: 601 })).toEqual({
      x: 370,
      y: 268,
    });
  });

  it('ignores the camera when the zoom is one and the viewport empty', () => {
    expect(cameraTranslation({ x: 0, y: 0 }, 1, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
