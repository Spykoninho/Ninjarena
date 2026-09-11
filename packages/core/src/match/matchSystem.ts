import type { SimulationContext } from '../simulation/context';

export function startMatch(_ctx: SimulationContext): void {
  // Rempli par la tâche 10.
}

export function matchPreStep(_ctx: SimulationContext): boolean {
  // Rempli par la tâche 10: indique si le gameplay est actif ce tick.
  return true;
}

export function matchPostStep(_ctx: SimulationContext): void {
  // Rempli par la tâche 10.
}
