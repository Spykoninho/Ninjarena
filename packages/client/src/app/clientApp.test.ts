import type { GameContent } from '@ninjarena/content';
import type { MapDocument, MatchConfig, RoomSettings } from '@ninjarena/core';
import type {
  ClientMessage,
  RoomPlayerView,
  RoomStatus,
  RoomView,
  ServerMessage,
} from '@ninjarena/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchStartedMessage, PongMessage, SnapshotMessage } from '../game/clientGame';
import { loadClientConfig } from '../config/clientConfig';
import { ClientApp } from './clientApp';
import type { ClientAppGame, ClientAppNetwork, EditorView, HomeView, LobbyView } from './clientApp';

const settings: RoomSettings = {
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 1,
  buildPoints: 10,
  mapId: 'arena',
  bestOf: 3,
  roundDurationMs: 240_000,
  friendlyFire: false,
};

const matchConfig: MatchConfig = {
  id: 'team-2x1',
  mode: 'team',
  teamCount: 2,
  playersPerTeam: 1,
  roundsToWin: 2,
  roundDurationMs: 240_000,
  countdownMs: 3000,
  roundEndDelayMs: 3000,
  friendlyFire: false,
  buildPoints: 10,
};

const mapDocument: MapDocument = {
  version: 1,
  id: 'arena',
  name: 'Arena',
  tileset: 'default',
  width: 8,
  height: 8,
  layers: {
    ground: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)),
    objects: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null)),
  },
  colliders: [],
  spawns: [{ x: 1, y: 1, team: 0 }],
};

const players: RoomPlayerView[] = [
  { id: 'c1', name: 'kage', team: 0, ready: true, loadout: null, loadoutValid: true },
  { id: 'c2', name: 'hanzo', team: 1, ready: true, loadout: null, loadoutValid: true },
];

function room(status: RoomStatus): RoomView {
  return {
    code: 'AB7K2P',
    hasPassword: false,
    hostId: 'c1',
    status,
    settings,
    map: null,
    players,
    startBlockers: [],
  };
}

const matchStarted: MatchStartedMessage = {
  type: 'matchStarted',
  playerId: 'c1',
  tickRate: 30,
  snapshotRate: 15,
  matchConfig,
  map: mapDocument,
};

const snapshot: SnapshotMessage = {
  type: 'snapshot',
  tick: 12,
  lastProcessedSeq: 3,
  world: { tick: 12 } as SnapshotMessage['world'],
  events: [],
};

class FakeNetwork implements ClientAppNetwork {
  readonly sent: ClientMessage[] = [];
  message: ((message: ServerMessage) => void) | null = null;
  close: (() => void) | null = null;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  send(message: ClientMessage): void {
    this.sent.push(message);
  }

  onMessage(handler: (message: ServerMessage) => void): void {
    this.message = handler;
  }

  onClose(handler: () => void): void {
    this.close = handler;
  }

  deliver(message: ServerMessage): void {
    if (this.message === null) throw new Error('no message handler registered');
    this.message(message);
  }

  drop(): void {
    if (this.close === null) throw new Error('no close handler registered');
    this.close();
  }
}

class FakeGame implements ClientAppGame {
  readonly calls: string[] = [];
  readonly begun: RoomPlayerView[][] = [];
  readonly snapshots: SnapshotMessage[] = [];
  roomPlayers: RoomPlayerView[] = [];
  active = false;

  init(): Promise<void> {
    this.calls.push('init');
    return Promise.resolve();
  }

  beginMatch(_message: MatchStartedMessage, roomPlayers: RoomPlayerView[]): void {
    this.calls.push('beginMatch');
    this.begun.push(roomPlayers);
    this.active = true;
  }

  handleSnapshot(message: SnapshotMessage): void {
    this.calls.push('handleSnapshot');
    this.snapshots.push(message);
  }

  handlePong(_message: PongMessage): void {
    this.calls.push('handlePong');
  }

  setRoomPlayers(roomPlayers: RoomPlayerView[]): void {
    this.calls.push('setRoomPlayers');
    this.roomPlayers = roomPlayers;
  }

  setStatus(): void {
    this.calls.push('setStatus');
  }

  endMatch(): void {
    this.calls.push('endMatch');
    this.active = false;
  }

  dispose(): void {
    this.calls.push('dispose');
  }
}

class FakeHome implements HomeView {
  readonly calls: string[] = [];
  errors: string[] = [];
  mounted = false;

  mount(): void {
    this.calls.push('mount');
    this.errors = [];
    this.mounted = true;
  }

  unmount(): void {
    this.calls.push('unmount');
    this.mounted = false;
  }

  setStatus(): void {
    this.calls.push('setStatus');
  }

  showError(message: string): void {
    this.calls.push('showError');
    this.errors.push(message);
  }
}

class FakeLobby implements LobbyView {
  readonly calls: string[] = [];
  errors: string[] = [];
  mounted = false;

  mount(): void {
    this.calls.push('mount');
    this.errors = [];
    this.mounted = true;
  }

  unmount(): void {
    this.calls.push('unmount');
    this.mounted = false;
  }

  update(): void {
    this.calls.push('update');
  }

  showError(message: string): void {
    this.calls.push('showError');
    this.errors.push(message);
  }
}

class FakeEditor implements EditorView {
  readonly calls: string[] = [];
  readonly saved: string[] = [];

  mount(): void {
    this.calls.push('mount');
  }

  unmount(): void {
    this.calls.push('unmount');
  }

  setMaps(): void {
    this.calls.push('setMaps');
  }

  showDocument(): void {
    this.calls.push('showDocument');
  }

  showSaved(id: string): void {
    this.calls.push('showSaved');
    this.saved.push(id);
  }

  setStatus(): void {
    this.calls.push('setStatus');
  }

  showError(): void {
    this.calls.push('showError');
  }
}

// Les tests tournent sous node: l'application ne fait que transmettre ces éléments à ses écrans.
const element = (): HTMLElement => ({}) as HTMLElement;

interface Harness {
  app: ClientApp;
  network: FakeNetwork;
  game: FakeGame;
  home: FakeHome;
  lobby: FakeLobby;
  editor: FakeEditor;
}

function harness(): Harness {
  const network = new FakeNetwork();
  const game = new FakeGame();
  const home = new FakeHome();
  const lobby = new FakeLobby();
  const editor = new FakeEditor();
  const app = new ClientApp({
    config: loadClientConfig('?name=kage'),
    content: {} as GameContent,
    network,
    game,
    screens: { home, lobby, editor },
    stage: element(),
    uiRoot: element(),
  });
  return { app, network, game, home, lobby, editor };
}

let h: Harness;

beforeEach(async () => {
  h = harness();
  await h.app.start();
});

describe('ClientApp.start', () => {
  it('introduces the session with the configured name', () => {
    expect(h.network.sent).toEqual([{ type: 'hello', protocolVersion: 3, name: 'kage' }]);
    expect(h.game.calls).toContain('init');
    expect(h.home.mounted).toBe(true);
  });
});

describe('ClientApp message routing', () => {
  it('keeps a lobby error visible through the room state that follows', () => {
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    h.network.deliver({ type: 'error', code: 'CANNOT_START', message: 'everyone must be ready' });
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.lobby.errors).toEqual(['everyone must be ready']);
    // Seul un remontage efface les erreurs de l'écran: un simple rendu ne doit pas en provoquer.
    expect(h.lobby.calls.filter((call) => call === 'mount')).toHaveLength(1);
  });

  it('ends the match before the lobby takes the screen back', () => {
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    h.network.deliver(matchStarted);
    expect(h.lobby.mounted).toBe(false);
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.game.calls.indexOf('endMatch')).toBeLessThan(
      h.game.calls.lastIndexOf('setRoomPlayers'),
    );
    expect(h.game.active).toBe(false);
    expect(h.lobby.mounted).toBe(true);
  });

  it('drops a snapshot that arrives while no match is running', () => {
    h.network.deliver(snapshot);
    expect(h.game.snapshots).toEqual([]);
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    h.network.deliver(matchStarted);
    h.network.deliver(snapshot);
    expect(h.game.snapshots).toEqual([snapshot]);
  });

  it('starts the match with the players the room last reported', () => {
    h.network.deliver({ type: 'roomState', room: room('STARTING') });
    h.network.deliver(matchStarted);
    expect(h.game.begun).toEqual([players]);
    expect(h.app.state.screen).toBe('game');
  });
});

// Les envois passent par une connexion asynchrone: le test laisse la microtâche s'exécuter.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ClientApp editor', () => {
  it('asks for the map list as soon as it connects with the editor open', async () => {
    const fresh = harness();
    const editorApp = new ClientApp({
      config: loadClientConfig('?name=kage&editor'),
      content: {} as GameContent,
      network: fresh.network,
      game: fresh.game,
      screens: { home: fresh.home, lobby: fresh.lobby, editor: fresh.editor },
      stage: element(),
      uiRoot: element(),
    });
    await editorApp.start();
    expect(fresh.network.sent.at(-1)).toEqual({ type: 'listMaps' });
  });

  it('asks for the map list and stays on a room state it did not request', () => {
    h.app.openEditor();
    expect(h.network.sent.at(-1)).toEqual({ type: 'listMaps' });
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.app.state.screen).toBe('editor');
  });

  it('pushes a fresh map list to the editor', () => {
    h.app.openEditor();
    h.network.deliver({ type: 'mapList', maps: [] });
    expect(h.editor.calls).toContain('setMaps');
  });

  it('reports a save without opening a room', () => {
    h.app.openEditor();
    h.network.deliver({ type: 'mapSaved', id: 'dojo-a1b2' });
    expect(h.editor.saved).toEqual(['dojo-a1b2']);
    expect(h.network.sent.filter((message) => message.type === 'createRoom')).toEqual([]);
    expect(h.app.state.screen).toBe('editor');
  });

  it('opens a room on the saved map when a test run is pending', async () => {
    h.app.openEditor();
    h.app.testMap(mapDocument);
    await flush();
    expect(h.network.sent.at(-1)).toEqual({ type: 'saveMap', document: mapDocument });
    h.network.deliver({ type: 'mapSaved', id: 'dojo-a1b2' });
    expect(h.network.sent.at(-1)).toEqual({
      type: 'createRoom',
      settings: { mapId: 'dojo-a1b2' },
    });
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.app.state.screen).toBe('lobby');
  });

  it('forgets a pending test run when the save is refused', async () => {
    h.app.openEditor();
    h.app.testMap(mapDocument);
    await flush();
    h.network.deliver({
      type: 'error',
      code: 'INVALID_MAP',
      message: 'the map has no spawn point',
    });
    h.network.deliver({ type: 'mapSaved', id: 'dojo-a1b2' });
    expect(h.network.sent.filter((message) => message.type === 'createRoom')).toEqual([]);
  });
});

describe('ClientApp disconnection', () => {
  it('ends the match and returns home with an error when the socket closes', () => {
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    h.network.deliver(matchStarted);
    h.network.drop();
    expect(h.game.calls).toContain('endMatch');
    expect(h.game.active).toBe(false);
    expect(h.app.state.screen).toBe('home');
    expect(h.app.state.room).toBeNull();
    expect(h.home.mounted).toBe(true);
    expect(h.home.errors).toEqual(['disconnected: the server closed the connection']);
  });
});
