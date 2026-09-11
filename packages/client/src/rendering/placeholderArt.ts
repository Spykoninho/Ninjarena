import type { TeamId } from '@ninjarena/core';
import type { Graphics } from 'pixi.js';

const OWN_TEAM_COLOR = 0x4aa3ff;
const OTHER_TEAM_COLORS = [0xff5a5a, 0xff9a3c, 0xd45ad4, 0xe8c14a];
const FALLBACK_TEAM_COLOR = 0xff5a5a;
const EYE_COLOR = 0xf2f2f2;
const BORDER_BRIGHTNESS = 0.45;

export function teamColor(teamId: TeamId, localTeamId: TeamId | null): number {
  if (localTeamId !== null && teamId === localTeamId) return OWN_TEAM_COLOR;
  // En ffa chaque joueur forme son équipe: la teinte vient du hachage de son identifiant.
  const index = hash(teamId) % OTHER_TEAM_COLORS.length;
  return OTHER_TEAM_COLORS[index] ?? FALLBACK_TEAM_COLOR;
}

export function drawPlayerGraphic(g: Graphics, teamColor: number, radius: number): void {
  const size = radius * 2;
  g.rect(-radius, -radius, size, size).fill(teamColor);
  g.rect(-radius, -radius, size, size).stroke({
    color: scaleColor(teamColor, BORDER_BRIGHTNESS),
    width: 1,
    alignment: 1,
  });
  const eye = Math.max(1, radius * 0.3);
  g.rect(radius - eye * 2, -radius + eye, eye, eye).fill(EYE_COLOR);
  g.rect(radius - eye * 2, radius - eye * 2, eye, eye).fill(EYE_COLOR);
}

function scaleColor(color: number, factor: number): number {
  const red = Math.round(((color >> 16) & 0xff) * factor);
  const green = Math.round(((color >> 8) & 0xff) * factor);
  const blue = Math.round((color & 0xff) * factor);
  return (red << 16) | (green << 8) | blue;
}

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i++) result = (result * 31 + value.charCodeAt(i)) >>> 0;
  return result;
}
