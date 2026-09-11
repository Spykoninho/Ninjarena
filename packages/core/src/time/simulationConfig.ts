export interface SimulationConfig {
  readonly tickRate: number;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = { tickRate: 60 };

export function tickDurationMs(config: SimulationConfig): number {
  return 1000 / config.tickRate;
}

export function secondsPerTick(config: SimulationConfig): number {
  return 1 / config.tickRate;
}

export function msToTicks(ms: number, config: SimulationConfig): number {
  return Math.max(0, Math.round((ms * config.tickRate) / 1000));
}

export function ticksToMs(ticks: number, config: SimulationConfig): number {
  return (ticks * 1000) / config.tickRate;
}
