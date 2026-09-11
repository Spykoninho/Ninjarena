// L'accumulation de flottants laisse parfois un pas complet à ~1e-13 ms près (ex. 144 fps).
const STEP_DRIFT_TOLERANCE = 1e-9;

export class FixedStepAccumulator {
  private accumulatedMs = 0;

  constructor(
    private readonly stepMs: number,
    private readonly maxStepsPerAdvance = 5,
  ) {}

  advance(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
    this.accumulatedMs += elapsedMs;
    let steps = Math.floor(this.accumulatedMs / this.stepMs + STEP_DRIFT_TOLERANCE);
    if (steps > this.maxStepsPerAdvance) {
      // Un long gel (onglet caché, pause GC) est abandonné plutôt que rejoué en rafale.
      steps = this.maxStepsPerAdvance;
      this.accumulatedMs = steps * this.stepMs;
    }
    this.accumulatedMs = Math.max(0, this.accumulatedMs - steps * this.stepMs);
    return steps;
  }

  get alpha(): number {
    return this.accumulatedMs / this.stepMs;
  }

  reset(): void {
    this.accumulatedMs = 0;
  }
}
