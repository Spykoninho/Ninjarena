import { describe, expect, it } from 'vitest';
import { CameraShake } from './cameraShake';

describe('CameraShake', () => {
  it('stays still until something shakes it', () => {
    expect(new CameraShake().advance(16)).toEqual({ x: 0, y: 0 });
  });

  it('never exceeds its intensity and decays to zero', () => {
    const shake = new CameraShake();
    shake.add(4);
    for (let elapsed = 0; elapsed < 250; elapsed += 16) {
      const offset = shake.advance(16);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(4);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(4);
    }
    expect(shake.advance(16)).toEqual({ x: 0, y: 0 });
  });

  it('moves between frames', () => {
    const shake = new CameraShake();
    shake.add(4);
    const first = shake.advance(16);
    const second = shake.advance(16);
    expect(first).not.toEqual(second);
  });

  it('repeats the same offsets for the same calls', () => {
    const left = new CameraShake();
    const right = new CameraShake();
    left.add(3);
    right.add(3);
    expect([left.advance(16), left.advance(16)]).toEqual([right.advance(16), right.advance(16)]);
  });

  it('keeps the strongest shake', () => {
    const shake = new CameraShake();
    shake.add(4);
    shake.add(1);
    const offset = shake.advance(0);
    expect(Math.max(Math.abs(offset.x), Math.abs(offset.y))).toBeGreaterThan(1);
  });
});
