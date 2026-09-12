import type { SimulationContext } from '../simulation/context';
import type { TeamId } from '../simulation/ids';
import { clearTransientEntities, resetWorldForRound } from './reset';
import { aliveTeams, teamsPresent } from './teams';

// Une fin de manche instantanée enchaîne ROUND_END → COUNTDOWN → IN_ROUND dans le même tick.
const MAX_PHASE_TRANSITIONS_PER_STEP = 3;

export function startMatch(ctx: SimulationContext): void {
  const match = ctx.world.match;
  if (match.phase !== 'WAITING' && match.phase !== 'MATCH_END') return;
  match.scores = {};
  for (const teamId of teamsPresent(ctx.world)) match.scores[teamId] = 0;
  match.round = 1;
  match.lastRoundWinner = null;
  match.winner = null;
  resetWorldForRound(ctx);
  const countdown = ctx.ticks(ctx.matchConfig.countdownMs);
  match.phase = 'COUNTDOWN';
  match.phaseEndsAt = ctx.now + countdown;
  // Un compte à rebours nul ouvre la manche sans attendre le tick suivant.
  if (countdown === 0) beginRound(ctx);
}

export function matchPreStep(ctx: SimulationContext): boolean {
  const match = ctx.world.match;
  for (let i = 0; i < MAX_PHASE_TRANSITIONS_PER_STEP; i++) {
    if (match.phaseEndsAt === null || match.phaseEndsAt > ctx.now) break;
    if (match.phase === 'COUNTDOWN') beginRound(ctx);
    else if (match.phase === 'ROUND_END') beginNextRound(ctx);
    else break;
  }
  return match.phase === 'IN_ROUND';
}

export function matchPostStep(ctx: SimulationContext): void {
  const match = ctx.world.match;
  if (match.phase !== 'IN_ROUND') return;
  const alive = aliveTeams(ctx.world);
  const present = teamsPresent(ctx.world);
  // Une seule équipe présente ne peut pas gagner contre elle-même: il faut un adversaire éliminé.
  if (alive.length <= 1 && alive.length < present.length) {
    endRound(ctx, alive[0] ?? null);
    return;
  }
  if (match.phaseEndsAt !== null && match.phaseEndsAt <= ctx.now) endRound(ctx, null);
}

function beginRound(ctx: SimulationContext): void {
  const match = ctx.world.match;
  match.phase = 'IN_ROUND';
  match.phaseEndsAt = ctx.now + ctx.ticks(ctx.matchConfig.roundDurationMs);
  ctx.events.push({ type: 'roundStarted', tick: ctx.now, round: match.round });
}

function beginNextRound(ctx: SimulationContext): void {
  const match = ctx.world.match;
  match.round += 1;
  resetWorldForRound(ctx);
  match.phase = 'COUNTDOWN';
  match.phaseEndsAt = ctx.now + ctx.ticks(ctx.matchConfig.countdownMs);
}

function endRound(ctx: SimulationContext, winner: TeamId | null): void {
  const match = ctx.world.match;
  match.lastRoundWinner = winner;
  if (winner !== null) match.scores[winner] = (match.scores[winner] ?? 0) + 1;
  ctx.events.push({ type: 'roundEnded', tick: ctx.now, round: match.round, winnerTeamId: winner });
  // Un tir ou une zone en cours ne doit pas tuer pendant le délai de fin de manche.
  clearTransientEntities(ctx);
  if (winner !== null && (match.scores[winner] ?? 0) >= ctx.matchConfig.roundsToWin) {
    match.phase = 'MATCH_END';
    match.phaseEndsAt = null;
    match.winner = winner;
    ctx.events.push({ type: 'matchEnded', tick: ctx.now, winnerTeamId: winner });
    return;
  }
  match.phase = 'ROUND_END';
  match.phaseEndsAt = ctx.now + ctx.ticks(ctx.matchConfig.roundEndDelayMs);
}
