import type { MapSummary } from '@ninjarena/core';
import type { RoomView, ServerMessage } from '@ninjarena/protocol';
import type { ClientConfig } from '../config/clientConfig';
import type { ScreenId } from './screen';

// Une salle ouverte depuis l'éditeur n'y ramène pas: l'appelant dit s'il attend un changement d'écran.
export type ReduceIntent = 'stay' | 'lobby';

export interface AppState {
  screen: ScreenId;
  sessionId: string | null;
  room: RoomView | null;
  maps: MapSummary[];
  status: string;
}

export function initialAppState(config: ClientConfig): AppState {
  return {
    screen: config.editor ? 'editor' : 'home',
    sessionId: null,
    room: null,
    maps: [],
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
      return { ...state, room: message.room, screen: screenWithRoom(state, message.room, intent) };
    case 'roomLeft':
      return { ...state, room: null, screen: 'home' };
    case 'matchStarted':
      return { ...state, screen: 'game' };
    case 'mapList':
      return { ...state, maps: message.maps };
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
      return 'lobby';
    case 'editor':
      return intent === 'lobby' ? 'lobby' : 'editor';
    case 'game':
      // Le retour au salon attend que la salle repasse en attente: un match en cours garde l'écran.
      return room.status === 'WAITING' ? 'lobby' : 'game';
    default:
      return state.screen;
  }
}
