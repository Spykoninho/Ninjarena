import type { TeamId, Tick } from '../simulation/ids';

export type MatchPhase = 'WAITING' | 'COUNTDOWN' | 'IN_ROUND' | 'ROUND_END' | 'MATCH_END';

export interface MatchState {
  phase: MatchPhase;
  phaseEndsAt: Tick | null;
  round: number;
  scores: Record<TeamId, number>;
  lastRoundWinner: TeamId | null;
  winner: TeamId | null;
}

export function createMatchState(): MatchState {
  return {
    phase: 'WAITING',
    phaseEndsAt: null,
    round: 0,
    scores: {},
    lastRoundWinner: null,
    winner: null,
  };
}
