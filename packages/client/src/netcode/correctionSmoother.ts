import type { Vec2 } from '@ninjarena/core';
import { add, length, scale } from '@ninjarena/core';

const DEFAULT_THRESHOLD_UNITS = 24;
const DEFAULT_DURATION_MS = 100;

// Absorbe les petites corrections de réconciliation dans un décalage visuel qui s'efface.
export class CorrectionSmoother {
  private readonly thresholdUnits: number;
  private readonly durationMs: number;
  private captured: Vec2 = { x: 0, y: 0 };
  private remainingMs = 0;

  constructor(
    thresholdUnits: number = DEFAULT_THRESHOLD_UNITS,
    durationMs: number = DEFAULT_DURATION_MS,
  ) {
    this.thresholdUnits = thresholdUnits;
    this.durationMs = durationMs;
  }

  absorb(error: Vec2): void {
    // Une correction large est une téléportation ou un rejet: la lisser mentirait sur la position.
    if (length(error) >= this.thresholdUnits) return;
    this.captured = add(this.offset, error);
    this.remainingMs = this.durationMs;
  }

  advance(dtMs: number): Vec2 {
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    return this.offset;
  }

  get offset(): Vec2 {
    if (this.remainingMs <= 0 || this.durationMs <= 0) return { x: 0, y: 0 };
    return scale(this.captured, this.remainingMs / this.durationMs);
  }
}
