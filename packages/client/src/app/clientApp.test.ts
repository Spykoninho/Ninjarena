import type { GameContent } from '@ninjarena/content';
import type { Loadout, MapDocument, MatchConfig, RoomSettings } from '@ninjarena/core';
import { emptyBuild } from '@ninjarena/core';
import type {
  AccountView,
  ClientMessage,
  MatchSummary,
  RoomPlayerView,
  RoomStatus,
  RoomView,
  ServerMessage,
} from '@ninjarena/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchStartedMessage, PongMessage, SnapshotMessage } from '../game/clientGame';
import type { HudExitAction } from '../ui/hud';
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
  ranked: false,
  practice: false,
  tournament: false,
  tournamentSize: 4,
};

const loadout: Loadout = {
  build: emptyBuild(),
  basicAttackId: 'kunai-strike',
  techniqueIds: ['blink', 'chakra-shield', 'lightning-dash'],
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
  practice: false,
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
  { id: 'c1', name: 'kage', team: 0, ready: true, loadout: null, loadoutValid: true, rating: 100 },
  {
    id: 'c2',
    name: 'hanzo',
    team: 1,
    ready: true,
    loadout: null,
    loadoutValid: true,
    rating: null,
  },
];

function room(status: RoomStatus, overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'AB7K2P',
    hasPassword: false,
    locked: false,
    hostId: 'c1',
    status,
    settings,
    map: null,
    players,
    startBlockers: [],
    tournament: null,
    ...overrides,
  };
}

const matchStarted: MatchStartedMessage = {
  type: 'matchStarted',
  playerId: 'c1',
  spectator: false,
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
  readonly summaries: MatchSummary[] = [];
  readonly exits: (HudExitAction | null)[] = [];
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

  showSummary(summary: MatchSummary): void {
    this.calls.push('showSummary');
    this.summaries.push(summary);
  }

  setExitAction(action: HudExitAction | null): void {
    this.calls.push('setExitAction');
    this.exits.push(action);
  }

  setRoomPlayers(roomPlayers: RoomPlayerView[]): void {
    this.calls.push('setRoomPlayers');
    this.roomPlayers = roomPlayers;
  }

  setTournament(): void {
    this.calls.push('setTournament');
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
  readonly accounts: (AccountView | null)[] = [];
  readonly leaderboards: AccountView[][] = [];
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

  setAccount(account: AccountView | null): void {
    this.calls.push('setAccount');
    this.accounts.push(account);
  }

  setLeaderboard(entries: AccountView[]): void {
    this.calls.push('setLeaderboard');
    this.leaderboards.push(entries);
  }

  readonly queues: { queued: boolean; size: number }[] = [];

  setQueue(queued: boolean, size: number): void {
    this.calls.push('setQueue');
    this.queues.push({ queued, size });
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
  loadout: Loadout | null = loadout;

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

  currentLoadout(): Loadout | null {
    return this.loadout;
  }

  showError(message: string): void {
    this.calls.push('showError');
    this.errors.push(message);
  }
}

class FakeEditor implements EditorView {
  readonly calls: string[] = [];
  readonly saved: string[] = [];
  readonly statuses: string[] = [];

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

  setStatus(status: string): void {
    this.calls.push('setStatus');
    this.statuses.push(status);
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
    expect(h.network.sent).toEqual([{ type: 'hello', protocolVersion: 5, name: 'kage' }]);
    expect(h.game.calls).toContain('init');
    expect(h.home.mounted).toBe(true);
  });
});

describe('ClientApp message routing', () => {
  it('keeps a lobby error visible through the room state that follows', () => {
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    h.network.deliver({ type: 'error', code: 'CANNOT_START', message: 'everyone must be ready' });
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.lobby.errors).toEqual(['La partie ne peut pas encore être lancée']);
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

  it('hands the match summary to a running game and drops it otherwise', () => {
    const summary: MatchSummary = {
      winnerTeamId: 'team-0',
      scores: { 'team-0': 2 },
      ranked: false,
      players: [],
    };
    h.network.deliver({ type: 'matchSummary', summary });
    expect(h.game.summaries).toEqual([]);
    h.network.deliver({ type: 'roomState', room: room('STARTING') });
    h.network.deliver(matchStarted);
    h.network.deliver({ type: 'matchSummary', summary });
    expect(h.game.summaries).toEqual([summary]);
    expect(h.app.state.screen).toBe('game');
  });

  it('starts the match with the players the room last reported', () => {
    h.network.deliver({ type: 'roomState', room: room('STARTING') });
    h.network.deliver(matchStarted);
    expect(h.game.begun).toEqual([players]);
    expect(h.app.state.screen).toBe('game');
  });

  it('offers to quit a running match, which leaves the room and comes back home', () => {
    h.network.deliver({ type: 'roomState', room: room('STARTING') });
    h.network.deliver(matchStarted);
    const exit = h.game.exits.at(-1);
    expect(exit?.label).toBe('Quitter la partie');
    exit?.run();
    expect(h.network.sent.at(-1)).toEqual({ type: 'leaveRoom' });
    h.network.deliver({ type: 'roomLeft' });
    expect(h.game.calls).toContain('endMatch');
    expect(h.app.state.screen).toBe('home');
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

  it('opens a practice room on the saved map when a test run is pending', async () => {
    h.app.openEditor();
    h.app.testMap(mapDocument);
    await flush();
    expect(h.network.sent.at(-1)).toEqual({ type: 'saveMap', document: mapDocument });
    h.network.deliver({ type: 'mapSaved', id: 'dojo-a1b2' });
    expect(h.network.sent.at(-1)).toEqual({
      type: 'createRoom',
      settings: { mapId: 'dojo-a1b2', practice: true },
    });
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.app.state.screen).toBe('editor');
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

  it('forgets a pending test run when the socket drops before the save lands', async () => {
    h.app.openEditor();
    h.app.testMap(mapDocument);
    await flush();
    h.network.drop();
    h.network.deliver({ type: 'mapSaved', id: 'dojo-a1b2' });
    expect(h.network.sent.filter((message) => message.type === 'createRoom')).toEqual([]);
  });
});

// Le pilote de l'essai: un état de salle par étape, du salon invisible jusqu'au coup d'envoi.
describe('ClientApp map test run', () => {
  const me = (overrides: Partial<RoomPlayerView>): RoomPlayerView => ({
    id: 'c1',
    name: 'kage',
    team: 0,
    ready: false,
    loadout: null,
    loadoutValid: false,
    rating: null,
    ...overrides,
  });

  async function startTest(): Promise<void> {
    h.network.deliver({ type: 'welcome', sessionId: 'c1' });
    h.app.openEditor();
    h.app.testMap(mapDocument);
    await flush();
    h.network.deliver({ type: 'mapSaved', id: 'dojo-a1b2' });
  }

  it('equips, readies up and starts alone without ever showing the lobby', async () => {
    await startTest();
    h.network.deliver({ type: 'roomState', room: room('WAITING', { players: [me({})] }) });
    expect(h.network.sent.at(-1)).toEqual({ type: 'setLoadout', loadout });
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', {
        players: [me({ loadout, loadoutValid: true })],
        startBlockers: ['PLAYER_NOT_READY', 'MAP_MISSING'],
      }),
    });
    expect(h.network.sent.at(-1)).toEqual({ type: 'setReady', ready: true });
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', {
        players: [me({ loadout, loadoutValid: true, ready: true })],
        startBlockers: ['MAP_MISSING'],
      }),
    });
    expect(h.network.sent.at(-1)).toEqual({ type: 'setReady', ready: true });
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', { players: [me({ loadout, loadoutValid: true, ready: true })] }),
    });
    expect(h.network.sent.at(-1)).toEqual({ type: 'startMatch' });
    expect(h.lobby.mounted).toBe(false);
    expect(h.app.state.screen).toBe('editor');

    h.network.deliver(matchStarted);
    expect(h.app.state.screen).toBe('game');
    expect(h.game.exits.at(-1)?.label).toBe('Retour à l’éditeur');
  });

  it('comes back to the editor, room released, when the exit action runs', async () => {
    await startTest();
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', { players: [me({ loadout, loadoutValid: true, ready: true })] }),
    });
    h.network.deliver(matchStarted);
    h.game.exits.at(-1)?.run();
    expect(h.network.sent.at(-1)).toEqual({ type: 'leaveRoom' });
    h.network.deliver({ type: 'roomLeft' });
    expect(h.app.state.screen).toBe('editor');
    expect(h.app.state.room).toBeNull();
    expect(h.game.active).toBe(false);
    expect(h.editor.statuses.at(-1)).toBe('Essai terminé');
    // L'éditeur redevient une simple fenêtre sur les salles: une salle non demandée ne l'emporte plus.
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.app.state.screen).toBe('editor');
  });

  it('leaves the room by itself when a practice match ends on its own', async () => {
    await startTest();
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', { players: [me({ loadout, loadoutValid: true, ready: true })] }),
    });
    h.network.deliver(matchStarted);
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.app.state.screen).toBe('editor');
    expect(h.network.sent.at(-1)).toEqual({ type: 'leaveRoom' });
  });

  it('falls back to the lobby when the room refuses to start or the server errors', async () => {
    await startTest();
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', {
        players: [me({ loadout, loadoutValid: true, ready: true })],
        startBlockers: ['MAP_INVALID'],
      }),
    });
    expect(h.app.state.screen).toBe('lobby');
    expect(h.lobby.mounted).toBe(true);
    expect(h.network.sent.filter((message) => message.type === 'startMatch')).toEqual([]);

    const again = harness();
    await again.app.start();
    h = again;
    await startTest();
    h.network.deliver({ type: 'roomState', room: room('WAITING', { players: [me({})] }) });
    h.network.deliver({ type: 'error', code: 'INVALID_LOADOUT', message: 'nope' });
    expect(h.app.state.screen).toBe('lobby');
    expect(h.lobby.errors).toEqual(['Équipement refusé par le serveur']);
  });
});

describe('ClientApp sandbox and ranked queue', () => {
  const me = (overrides: Partial<RoomPlayerView>): RoomPlayerView => ({
    id: 'c1',
    name: 'kage',
    team: 0,
    ready: true,
    loadout,
    loadoutValid: true,
    rating: null,
    ...overrides,
  });

  it('opens a practice room from home, starts alone and comes back home on exit', async () => {
    h.network.deliver({ type: 'welcome', sessionId: 'c1' });
    h.app.createSandbox('kage');
    await flush();
    expect(h.network.sent.at(-1)).toEqual({
      type: 'createRoom',
      settings: { practice: true },
    });
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', {
        players: [me({ ready: false, loadout: null, loadoutValid: false })],
      }),
    });
    expect(h.network.sent.at(-1)).toEqual({ type: 'setLoadout', loadout });
    expect(h.app.state.screen).toBe('home');
    expect(h.lobby.mounted).toBe(false);
    h.network.deliver({
      type: 'roomState',
      room: room('WAITING', { players: [me({ ready: false })] }),
    });
    expect(h.network.sent.at(-1)).toEqual({ type: 'setReady', ready: true });
    h.network.deliver({ type: 'roomState', room: room('WAITING', { players: [me({})] }) });
    expect(h.network.sent.at(-1)).toEqual({ type: 'startMatch' });

    h.network.deliver(matchStarted);
    expect(h.app.state.screen).toBe('game');
    const exit = h.game.exits.at(-1);
    expect(exit?.label).toBe('Quitter le bac à sable');
    exit?.run();
    h.network.deliver({ type: 'roomLeft' });
    expect(h.app.state.screen).toBe('home');
    expect(h.home.mounted).toBe(true);
    // Une salle rejointe ensuite reprend le chemin normal du salon.
    h.network.deliver({ type: 'roomState', room: room('WAITING') });
    expect(h.app.state.screen).toBe('lobby');
  });

  it('joins the queue, reflects its size on the home screen and lands in the found room', async () => {
    h.network.deliver({ type: 'welcome', sessionId: 'c1' });
    h.app.joinQueue('kage');
    await flush();
    expect(h.network.sent.at(-1)).toEqual({ type: 'joinQueue' });
    h.network.deliver({ type: 'queueState', queued: true, size: 3 });
    expect(h.home.queues.at(-1)).toEqual({ queued: true, size: 3 });
    expect(h.app.state.queue).toEqual({ queued: true, size: 3 });

    h.app.leaveQueue();
    expect(h.network.sent.at(-1)).toEqual({ type: 'leaveQueue' });
    h.network.deliver({ type: 'queueState', queued: false, size: 2 });
    expect(h.home.queues.at(-1)).toEqual({ queued: false, size: 2 });

    h.network.deliver({ type: 'queueState', queued: true, size: 1 });
    h.network.deliver({ type: 'roomState', room: room('WAITING', { locked: true }) });
    expect(h.app.state.queue).toEqual({ queued: false, size: 0 });
    expect(h.app.state.screen).toBe('lobby');
  });

  it('sends the tournament settings a custom creation asks for', async () => {
    h.network.deliver({ type: 'welcome', sessionId: 'c1' });
    h.app.createRoom('kage', '', { tournament: true, tournamentSize: 8 });
    await flush();
    expect(h.network.sent.at(-1)).toEqual({
      type: 'createRoom',
      settings: { tournament: true, tournamentSize: 8 },
    });
  });
});

describe('ClientApp accounts', () => {
  const account: AccountView = { name: 'Kage', rating: 115, wins: 1, losses: 0 };

  it('sends the credentials and pushes the account to the home screen once', async () => {
    h.app.register('Kage', 'shadow');
    await flush();
    expect(h.network.sent.at(-1)).toEqual({ type: 'register', name: 'Kage', password: 'shadow' });
    h.network.deliver({ type: 'accountState', account });
    h.network.deliver({ type: 'mapList', maps: [] });
    expect(h.home.accounts).toEqual([account]);
    expect(h.app.state.account).toEqual(account);
  });

  it('keeps the account name over whatever a form asks for while logged in', async () => {
    h.app.login('kage', 'shadow');
    await flush();
    h.network.deliver({ type: 'accountState', account });
    const fresh = h.network.sent.length;
    h.app.createRoom('someone-else', '');
    await flush();
    expect(h.network.sent.slice(fresh)).toEqual([{ type: 'createRoom' }]);
  });

  it('sends a logout and reflects the guest state, then forgets the account on a drop', async () => {
    h.app.login('kage', 'shadow');
    await flush();
    h.network.deliver({ type: 'accountState', account });
    h.app.logout();
    expect(h.network.sent.at(-1)).toEqual({ type: 'logout' });
    h.network.deliver({ type: 'accountState', account: null });
    expect(h.home.accounts.at(-1)).toBeNull();

    h.network.deliver({ type: 'accountState', account });
    h.network.drop();
    expect(h.app.state.account).toBeNull();
    expect(h.home.accounts.at(-1)).toBeNull();
  });

  it('asks for the leaderboard and hands the entries to the home screen', async () => {
    h.app.openLeaderboard();
    await flush();
    expect(h.network.sent.at(-1)).toEqual({ type: 'getLeaderboard' });
    h.network.deliver({ type: 'leaderboard', entries: [account] });
    expect(h.home.leaderboards.at(-1)).toEqual([account]);
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
    expect(h.home.errors).toEqual(['Déconnecté : le serveur a fermé la connexion']);
  });
});
