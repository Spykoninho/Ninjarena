import { FixedStepAccumulator } from '@ninjarena/core';

export interface TickLoopOptions {
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  maxCatchUpSteps?: number;
}

const DEFAULT_MAX_CATCH_UP_STEPS = 5;

export class TickLoop {
  private readonly stepMs: number;
  private readonly onTick: () => void;
  private readonly accumulator: FixedStepAccumulator;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private handle: unknown = null;
  private lastWake = 0;
  private isRunning = false;

  constructor(stepMs: number, onTick: () => void, options: TickLoopOptions = {}) {
    this.stepMs = stepMs;
    this.onTick = onTick;
    this.accumulator = new FixedStepAccumulator(
      stepMs,
      options.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP_STEPS,
    );
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancel =
      options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.accumulator.reset();
    this.lastWake = this.now();
    this.scheduleNext();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.handle !== null) this.cancel(this.handle);
    this.handle = null;
  }

  get running(): boolean {
    return this.isRunning;
  }

  private scheduleNext(): void {
    // Le temps déjà consommé par le réveil courant est déduit: la dérive ne s'accumule pas.
    const delayMs = Math.max(0, this.stepMs - (this.now() - this.lastWake));
    this.handle = this.schedule(() => {
      this.wake();
    }, delayMs);
  }

  private wake(): void {
    if (!this.isRunning) return;
    this.handle = null;
    const now = this.now();
    const steps = this.accumulator.advance(now - this.lastWake);
    this.lastWake = now;
    for (let i = 0; i < steps; i++) this.onTick();
    if (!this.isRunning) return;
    this.scheduleNext();
  }
}
