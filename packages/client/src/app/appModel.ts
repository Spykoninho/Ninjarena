import type { MapSummary } from '@ninjarena/core';
import type { AccountView, RoomView, ServerMessage } from '@ninjarena/protocol';
import type { ClientConfig } from '../config/clientConfig';
import type { ScreenId } from './screen';

// Une salle ouverte depuis l'éditeur n'y ramène pas: l'appelant dit s'il attend un changement d'écran.
// `test` est l'essai d'une carte et `sandbox` le bac à sable: le salon reste invisible et la sortie
// du match ramène là d'où l'on vient, l'éditeur ou l'accueil.
export type ReduceIntent = 'stay' | 'lobby' | 'test' | 'sandbox';

export interface QueueState {
  queued: boolean;
  size: number;
}

export interface AppState {
  screen: ScreenId;
  sessionId: string | null;
  room: RoomView | null;
  maps: MapSummary[];
  account: AccountView | null;
  leaderboard: AccountView[];
  queue: QueueState;
  status: string;
}

const NOT_QUEUED: QueueState = { queued: false, size: 0 };

export function initialAppState(config: ClientConfig): AppState {
  return {
    screen: config.editor ? 'editor' : 'home',
    sessionId: null,
    room: null,
    maps: [],
    account: null,
    leaderboard: [],
    queue: NOT_QUEUED,
    status: 'idle',
  };
}

export function reduceServerMessage(
  state: AppState,
  message: ServerMessage,
  intent: ReduceIntent = 'lobby',
): AppState {
  switch (message.type) {
    case 'welcome':
      return { ...state, sessionId: message.sessionId, status: `Session ${message.sessionId}` };
    case 'roomState':
      // Une salle reçue sort de la file: la partie trouvée est là.
      return {
        ...state,
        room: message.room,
        queue: NOT_QUEUED,
        screen: screenWithRoom(state, message.room, intent),
      };
    case 'roomLeft':
      return { ...state, room: null, screen: intent === 'test' ? 'editor' : 'home' };
    case 'queueState':
      return { ...state, queue: { queued: message.queued, size: message.size } };
    case 'matchStarted':
      return { ...state, screen: 'game' };
    case 'mapList':
      return { ...state, maps: message.maps };
    case 'accountState':
      return { ...state, account: message.account };
    case 'leaderboard':
      return { ...state, leaderboard: message.entries };
    case 'error':
      return { ...state, status: message.message };
    default:
      return state;
  }
}

export function screenFor(state: AppState): ScreenId {
  // Une salle ou un match sans `RoomView` n'a rien à afficher: l'accueil reprend la main.
  if ((state.screen === 'lobby' || state.screen === 'game') && state.room === null) return 'home';
  return state.screen;
}

function screenWithRoom(state: AppState, room: RoomView, intent: ReduceIntent): ScreenId {
  switch (state.screen) {
    case 'home':
      return intent === 'sandbox' ? 'home' : 'lobby';
    case 'editor':
      return intent === 'lobby' ? 'lobby' : 'editor';
    case 'game':
      // Le retour au salon attend que la salle repasse en attente: un match en cours garde l'écran.
      if (room.status !== 'WAITING') return 'game';
      return intent === 'test' ? 'editor' : intent === 'sandbox' ? 'home' : 'lobby';
    default:
      return state.screen;
  }
}
