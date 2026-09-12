// Un gel très court accentue l'impact: la simulation continue, seul le rendu s'arrête.
export class HitStop {
  private remainingMs = 0;

  trigger(ms: number): void {
    this.remainingMs = Math.max(this.remainingMs, ms);
  }

  advance(dtMs: number): boolean {
    if (this.remainingMs <= 0) return false;
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    return true;
  }
}
