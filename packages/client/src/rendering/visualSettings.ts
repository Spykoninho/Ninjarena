export interface VisualSettings {
  motion: boolean;
  flashes: boolean;
  shake: boolean;
}
let cached: VisualSettings | null = null;
export function visualSettings(): VisualSettings {
  if (cached) return cached;
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cached = { motion: !reduced, flashes: !reduced, shake: !reduced };
  try {
    const saved = JSON.parse(
      localStorage.getItem('ninjarena.visuals') ?? 'null',
    ) as Partial<VisualSettings> | null;
    for (const key of ['motion', 'flashes', 'shake'] as const)
      if (typeof saved?.[key] === 'boolean') cached[key] = saved[key];
  } catch {
    /* Preferences are optional in private browsing. */
  }
  return cached;
}
export function setVisualSetting(key: keyof VisualSettings, value: boolean): void {
  const settings = visualSettings();
  settings[key] = value;
  try {
    localStorage.setItem('ninjarena.visuals', JSON.stringify(settings));
  } catch {
    /* Session-only fallback. */
  }
}
