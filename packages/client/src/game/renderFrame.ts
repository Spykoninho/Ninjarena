import type { PlayerId, PlayerState, Vec2 } from '@ninjarena/core';
import { isVisibleTo } from '@ninjarena/core';
import type { InterpolatedWorld } from '../netcode/snapshotInterpolator';
import type { PlayerView, ProjectileView, RenderFrame } from '../rendering/renderer';

export interface RenderFrameInput {
  localPlayerId: PlayerId;
  localPlayer: PlayerState | undefined;
  localPosition: Vec2;
  remotes: InterpolatedWorld | null;
  isFfa: boolean;
}

export function buildRenderFrame(input: RenderFrameInput): RenderFrame {
  const players: PlayerView[] = [];
  if (input.localPlayer !== undefined) {
    players.push(toPlayerView(input.localPlayer, input.localPosition, true, true));
  }
  for (const remote of Object.values(input.remotes?.players ?? {})) {
    // Le joueur local vient de la prédiction, jamais de l'interpolation.
    if (remote.id === input.localPlayerId) continue;
    const visible = input.localPlayer === undefined || isVisibleTo(remote, input.localPlayer);
    players.push(toPlayerView(remote, remote.renderPosition, false, visible));
  }
  const projectiles: ProjectileView[] = Object.values(input.remotes?.projectiles ?? {}).map(
    (projectile) => ({
      id: projectile.id,
      position: projectile.renderPosition,
      radius: projectile.radius,
    }),
  );
  return { camera: input.localPosition, players, projectiles, isFfa: input.isFfa };
}

function toPlayerView(
  player: PlayerState,
  position: Vec2,
  isLocal: boolean,
  visible: boolean,
): PlayerView {
  return {
    id: player.id,
    teamId: player.teamId,
    position,
    aim: player.aim,
    phase: player.phase.kind,
    isLocal,
    visible,
    healthRatio: player.stats.maxHealth > 0 ? player.health / player.stats.maxHealth : 0,
  };
}
