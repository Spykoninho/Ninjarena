import { describe, expect, it } from 'vitest';
import { TickLoop } from './tickLoop';

describe('TickLoop', () => {
  it('runs one tick per step of virtual time and catches up after a stall', () => {
    let time = 0;
    const pending: Array<() => void> = [];
    let ticks = 0;
    const loop = new TickLoop(10, () => ticks++, {
      now: () => time,
      schedule: (cb) => {
        pending.push(cb);
        return cb;
      },
      cancel: () => {},
      maxCatchUpSteps: 5,
    });
    loop.start();
    time = 10;
    pending.shift()!();
    expect(ticks).toBe(1);
    time = 45;
    pending.shift()!();
    expect(ticks).toBe(4);
    loop.stop();
    time = 100;
    pending.shift()?.();
    expect(ticks).toBe(4);
  });

  it('reports whether it is running', () => {
    const loop = new TickLoop(10, () => {}, {
      now: () => 0,
      schedule: () => 0,
      cancel: () => {},
    });
    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });
});
