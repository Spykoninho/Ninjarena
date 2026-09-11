const SMOOTHING = 0.1;

export class ServerClock {
  private readonly tickDurationMs: number;
  private estimatedTick: number | null = null;
  private estimatedAtMs = 0;

  constructor(tickDurationMs: number) {
    if (!Number.isFinite(tickDurationMs) || tickDurationMs <= 0) {
      throw new Error(`Invalid tick duration ${tickDurationMs}`);
    }
    this.tickDurationMs = tickDurationMs;
  }

  get hasEstimate(): boolean {
    return this.estimatedTick !== null;
  }

  observe(serverTick: number, receivedAtMs: number): void {
    if (this.estimatedTick === null) {
      this.estimatedTick = serverTick;
      this.estimatedAtMs = receivedAtMs;
      return;
    }
    // Le lissage se fait autour de l'extrapolation courante: un paquet en retard ne fait pas sauter l'horloge.
    const projected = this.estimateTick(receivedAtMs);
    this.estimatedTick = projected + (serverTick - projected) * SMOOTHING;
    this.estimatedAtMs = receivedAtMs;
  }

  estimateTick(nowMs: number): number {
    if (this.estimatedTick === null) return 0;
    return this.estimatedTick + (nowMs - this.estimatedAtMs) / this.tickDurationMs;
  }
}
