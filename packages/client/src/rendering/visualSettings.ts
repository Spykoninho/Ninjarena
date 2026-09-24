export interface VisualSettings {
  motion: boolean;
  flashes: boolean;
  shake: boolean;
}
let cached: VisualSettings | null = null;
// Les effets n'ont plus de réglage: seul le « réduire les animations » du système les coupe.
export function visualSettings(): VisualSettings {
  if (cached) return cached;
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cached = { motion: !reduced, flashes: !reduced, shake: !reduced };
  return cached;
}
