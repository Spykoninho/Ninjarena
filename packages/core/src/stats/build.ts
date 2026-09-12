import type { AttributeId, StatRulesDefinition } from '../definitions/statRules';
import { ATTRIBUTE_IDS } from '../definitions/statRules';

export type Build = Record<AttributeId, number>;

export function emptyBuild(): Build {
  const build = {} as Build;
  for (const id of ATTRIBUTE_IDS) build[id] = 0;
  return build;
}

export type BuildValidation = { ok: true; build: Build } | { ok: false; reason: string };

export function validateBuild(
  raw: unknown,
  rules: StatRulesDefinition,
  budget: number,
): BuildValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'build must be an object' };
  }
  const entries = raw as Record<string, unknown>;
  for (const key of Object.keys(entries)) {
    if (!(ATTRIBUTE_IDS as readonly string[]).includes(key)) {
      return { ok: false, reason: `unknown attribute "${key}"` };
    }
  }
  const build = emptyBuild();
  for (const id of ATTRIBUTE_IDS) {
    const value = entries[id];
    if (value === undefined) return { ok: false, reason: `${id} is missing` };
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return { ok: false, reason: `${id} must be a whole number of points` };
    }
    const range = rules.attributes[id];
    if (value < range.min || value > range.max) {
      return { ok: false, reason: `${id} must be between ${range.min} and ${range.max}` };
    }
    build[id] = value;
  }
  const spent = buildPointsSpent(build);
  if (spent > budget) {
    return { ok: false, reason: `build spends ${spent} points, budget is ${budget}` };
  }
  return { ok: true, build };
}

export function buildPointsSpent(build: Build): number {
  let spent = 0;
  for (const id of ATTRIBUTE_IDS) spent += build[id];
  return spent;
}
