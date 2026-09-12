import type { Loadout } from '@ninjarena/core';
import type { ClientSession } from '../session/clientSession';

export interface RoomPlayer {
  session: ClientSession;
  team: number | null;
  ready: boolean;
  loadout: Loadout | null;
  loadoutValid: boolean;
  joinedAt: number;
}
