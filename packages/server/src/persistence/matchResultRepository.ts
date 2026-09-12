import type { RoomSettings, TeamId } from '@ninjarena/core';

export interface MatchResultPlayer {
  id: string;
  name: string;
  teamId: TeamId;
}

export interface MatchResult {
  roomCode: string;
  settings: RoomSettings;
  players: MatchResultPlayer[];
  winnerTeamId: TeamId | null;
  scores: Record<TeamId, number>;
  endedAt: number;
}

export interface MatchResultRepository {
  save(result: MatchResult): Promise<void>;
  list(): Promise<MatchResult[]>;
}

export class InMemoryMatchResultRepository implements MatchResultRepository {
  private readonly results: MatchResult[] = [];

  save(result: MatchResult): Promise<void> {
    this.results.push(result);
    return Promise.resolve();
  }

  list(): Promise<MatchResult[]> {
    return Promise.resolve([...this.results]);
  }
}
