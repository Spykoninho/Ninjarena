export function clonePlain<T>(value: T): T {
  // structuredClone n'existe pas avec ces lib settings: copie récursive des données simples.
  if (Array.isArray(value)) {
    return value.map((item: unknown) => clonePlain(item)) as unknown as T;
  }
  if (value === null || typeof value !== 'object') return value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // Une clé `__proto__` venue d'un JSON hostile reparenterait la copie: elle est ignorée.
    if (key === '__proto__') continue;
    copy[key] = clonePlain(item);
  }
  return copy as T;
}
