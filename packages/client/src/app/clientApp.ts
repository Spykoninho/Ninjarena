import type { GameContent } from '@ninjarena/content';
import type { Loadout, MapDocument, MapSummary, RoomSettingsPatch } from '@ninjarena/core';
import type {
  AccountView,
  ClientMessage,
  MatchSummary,
  RoomPlayerView,
  RoomView,
  ServerMessage,
  TournamentView,
} from '@ninjarena/protocol';
import { PROTOCOL_VERSION } from '@ninjarena/protocol';
import type { ClientConfig } from '../config/clientConfig';
import type { MatchStartedMessage, PongMessage, SnapshotMessage } from '../game/clientGame';
import type { HudExitAction } from '../ui/hud';
import { serverErrorText } from './errorText';
import { initialAppState, reduceServerMessage, screenFor } from './appModel';
import type { AppState, ReduceIntent } from './appModel';
import type { Screen, ScreenId } from './screen';

// Les dépendances sont décrites par ce dont l'application se sert, pour que les tests puissent les doubler.
export interface ClientAppNetwork {
  connect(url: string): Promise<void>;
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): void;
  onClose(handler: () => void): void;
}

export interface ClientAppGame {
  init(container: HTMLElement): Promise<void>;
  readonly active: boolean;
  beginMatch(message: MatchStartedMessage, roomPlayers: RoomPlayerView[]): void;
  handleSnapshot(message: SnapshotMessage): void;
  handlePong(message: PongMessage): void;
  showSummary(summary: MatchSummary): void;
  setExitAction(action: HudExitAction | null): void;
  setRoomPlayers(players: RoomPlayerView[]): void;
  setTournament(view: TournamentView | null, localId: string): void;
  setStatus(status: string): void;
  endMatch(): void;
  dispose(): void;
}

export interface HomeView extends Screen {
  setStatus(status: string): void;
  setAccount(account: AccountView | null): void;
  setLeaderboard(entries: AccountView[]): void;
  setQueue(queued: boolean, size: number): void;
  showError(message: string): void;
}

export interface LobbyView extends Screen {
  update(room: RoomView, maps: MapSummary[], sessionId: string): void;
  currentLoadout(): Loadout | null;
  showError(message: string): void;
}

export interface EditorView extends Screen {
  setMaps(maps: MapSummary[]): void;
  showDocument(document: MapDocument): void;
  showSaved(id: string): void;
  setStatus(status: string): void;
  showError(message: string): void;
}

export interface ClientAppScreens {
  home: HomeView;
  lobby: LobbyView;
  editor: EditorView;
}

export interface ClientAppDeps {
  config: ClientConfig;
  content: GameContent;
  network: ClientAppNetwork;
  game: ClientAppGame;
  screens: ClientAppScreens;
  stage: HTMLElement;
  uiRoot: HTMLElement;
}

const DISCONNECTED = 'Déconnecté : le serveur a fermé la connexion';
const EXIT_MATCH_LABEL = 'Quitter la partie';

// Une partie jouée seul: l'essai d'une carte depuis l'éditeur, ou le bac à sable depuis l'accueil.
type SoloMode = 'test' | 'sandbox';

// Les étapes d'une partie en solo, franchies une fois chacune au fil des états de salle reçus.
type SoloStage = 'equip' | 'ready' | 'start' | 'started';

interface SoloRun {
  mode: SoloMode;
  stage: SoloStage;
}

const SOLO_TEXTS: Record<
  SoloMode,
  { preparing: string; exit: string; ended: string; intent: ReduceIntent }
> = {
  test: {
    preparing: 'Préparation de l’essai…',
    exit: 'Retour à l’éditeur',
    ended: 'Essai terminé',
    intent: 'test',
  },
  sandbox: {
    preparing: 'Préparation du bac à sable…',
    exit: 'Quitter le bac à sable',
    ended: 'Bac à sable terminé',
    intent: 'sandbox',
  },
};

export class ClientApp {
  private readonly deps: ClientAppDeps;
  private appState: AppState;
  private mounted: ScreenId | null = null;
  private intent: ReduceIntent = 'lobby';
  private name: string;
  private renderedMaps: MapSummary[] | null = null;
  private renderedAccount: AccountView | null = null;
  private renderedLeaderboard: AccountView[] | null = null;
  private renderedQueue: AppState['queue'] | null = null;
  private lastError: string | null = null;
  private connected = false;
  private connecting = false;
  private mapsRequested = false;
  private pendingTest = false;
  private solo: SoloRun | null = null;

  constructor(deps: ClientAppDeps) {
    this.deps = deps;
    this.appState = initialAppState(deps.config);
    this.name = deps.config.playerName;
  }

  get state(): AppState {
    return this.appState;
  }

  async start(): Promise<void> {
    const { game, network, stage } = this.deps;
    await game.init(stage);
    network.onMessage((message) => {
      this.handleMessage(message);
    });
    network.onClose(() => {
      this.handleClose();
    });
    this.render();
    await this.connect();
  }

  send(message: ClientMessage): void {
    this.deps.network.send(message);
  }

  stop(): void {
    this.deps.game.dispose();
  }

  createRoom(name: string, password: string, settings: RoomSettingsPatch = {}): void {
    void this.withSession(name, () => {
      this.intent = 'lobby';
      this.send({
        type: 'createRoom',
        ...optionalPassword(password),
        ...(Object.keys(settings).length === 0 ? {} : { settings }),
      });
    });
  }

  // Le bac à sable est une salle d'entraînement pilotée depuis l'accueil, sans passer par le salon.
  createSandbox(name: string): void {
    void this.withSession(name, () => {
      this.beginSolo('sandbox');
      this.send({ type: 'createRoom', settings: { practice: true } });
    });
  }

  joinRoom(name: string, code: string, password: string): void {
    void this.withSession(name, () => {
      this.intent = 'lobby';
      this.send({ type: 'joinRoom', code, ...optionalPassword(password) });
    });
  }

  joinQueue(name: string): void {
    void this.withSession(name, () => {
      this.intent = 'lobby';
      this.send({ type: 'joinQueue' });
    });
  }

  leaveQueue(): void {
    if (!this.connected) return;
    this.send({ type: 'leaveQueue' });
  }

  login(name: string, password: string): void {
    void this.withSession(name, () => {
      this.send({ type: 'login', name, password });
    });
  }

  register(name: string, password: string): void {
    void this.withSession(name, () => {
      this.send({ type: 'register', name, password });
    });
  }

  logout(): void {
    if (!this.connected) return;
    this.send({ type: 'logout' });
  }

  openLeaderboard(): void {
    void this.withSession(this.name, () => {
      this.send({ type: 'getLeaderboard' });
    });
  }

  openEditor(): void {
    // L'éditeur ne veut pas être quitté par une salle qu'il n'a pas demandée.
    this.intent = 'stay';
    this.appState = { ...this.appState, screen: 'editor' };
    this.render();
    if (this.connected) this.send({ type: 'listMaps' });
  }

  // L'essai enchaîne l'enregistrement et l'ouverture d'une salle: seul le serveur connaît l'identifiant final.
  testMap(document: MapDocument): void {
    void this.withSession(this.name, () => {
      this.pendingTest = true;
      this.send({ type: 'saveMap', document });
    });
  }

  leaveEditor(): void {
    this.intent = 'lobby';
    this.pendingTest = false;
    this.solo = null;
    this.appState = { ...this.appState, screen: 'home' };
    this.render();
  }

  private async withSession(name: string, action: () => void): Promise<void> {
    const trimmed = name.trim();
    // Un compte impose son pseudo: un formulaire ne renomme que l'invité.
    const renamed = this.appState.account === null && trimmed.length > 0 && trimmed !== this.name;
    if (renamed) this.name = trimmed;
    const fresh = !this.connected;
    if (!(await this.connect())) return;
    // Une connexion neuve porte déjà le nom courant; sinon un `hello` hors salle renomme la session.
    if (renamed && !fresh) this.sendHello();
    action();
  }

  private async connect(): Promise<boolean> {
    const { config, network } = this.deps;
    if (this.connected) return true;
    if (this.connecting) return false;
    this.connecting = true;
    this.setStatus(`Connexion à ${config.serverUrl}…`);
    try {
      await network.connect(config.serverUrl);
    } catch (error) {
      this.showError(`Connexion impossible : ${reasonOf(error)}`);
      return false;
    } finally {
      this.connecting = false;
    }
    this.connected = true;
    this.sendHello();
    // Un éditeur ouvert avant la connexion n'a pas pu demander sa liste de cartes.
    if (screenFor(this.appState) === 'editor') this.send({ type: 'listMaps' });
    return true;
  }

  private sendHello(): void {
    this.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, name: this.name });
  }

  private handleMessage(message: ServerMessage): void {
    const { game } = this.deps;
    if (message.type === 'snapshot') {
      if (game.active) game.handleSnapshot(message);
      return;
    }
    if (message.type === 'pong') {
      if (game.active) game.handlePong(message);
      return;
    }
    const next = reduceServerMessage(this.appState, message, this.intent);
    // Le match doit être démonté avant que le salon ne reprenne l'écran.
    const leftGame = this.appState.screen === 'game' && next.screen !== 'game';
    if (leftGame && game.active) game.endMatch();
    this.appState = next;
    this.applyMessage(message);
    // Une partie en solo dont le match s'achève rend la salle: rien ne reste ouvert derrière.
    if (leftGame && this.solo !== null && next.room !== null) this.send({ type: 'leaveRoom' });
    if (message.type === 'error') this.showError(serverErrorText(message.code, message.message));
    else this.render();
  }

  private applyMessage(message: ServerMessage): void {
    const { game, screens } = this.deps;
    switch (message.type) {
      case 'roomState':
        // Le formulaire de l'hôte a besoin des cartes: la liste est demandée dès la première salle.
        this.requestMaps();
        game.setRoomPlayers(message.room.players);
        game.setTournament(message.room.tournament, this.appState.sessionId ?? '');
        if (this.solo !== null) this.driveSolo(message.room);
        return;
      case 'roomLeft':
        if (this.solo !== null) this.endSolo();
        return;
      case 'matchStarted':
        game.beginMatch(message, this.appState.room?.players ?? []);
        game.setTournament(this.appState.room?.tournament ?? null, this.appState.sessionId ?? '');
        // Quitter en cours de match vaut abandon: la salle est rendue et l'on revient d'où l'on vient.
        if (this.solo !== null) this.solo.stage = 'started';
        else this.intent = 'lobby';
        game.setExitAction({
          label: this.solo === null ? EXIT_MATCH_LABEL : SOLO_TEXTS[this.solo.mode].exit,
          run: () => this.send({ type: 'leaveRoom' }),
        });
        return;
      case 'matchSummary':
        if (game.active) game.showSummary(message.summary);
        return;
      case 'accountState':
        // Le compte impose son pseudo: le prochain `hello` et les salles l'utilisent.
        if (message.account !== null) this.name = message.account.name;
        return;
      case 'mapDocument':
        screens.editor.showDocument(message.document);
        return;
      case 'mapSaved':
        screens.editor.showSaved(message.id);
        if (!this.pendingTest) return;
        this.pendingTest = false;
        // L'essai se joue seul, sans salon: une salle d'entraînement se prépare derrière l'éditeur.
        this.beginSolo('test');
        this.send({ type: 'createRoom', settings: { mapId: message.id, practice: true } });
        return;
      case 'error':
        this.pendingTest = false;
        if (this.solo !== null && this.solo.stage !== 'started') this.abandonSolo();
        return;
      default:
        return;
    }
  }

  private beginSolo(mode: SoloMode): void {
    this.solo = { mode, stage: 'equip' };
    this.intent = SOLO_TEXTS[mode].intent;
    this.soloStatus(SOLO_TEXTS[mode].preparing);
  }

  // Chaque état de salle fait franchir au plus une étape: équiper, se dire prêt, puis lancer.
  private driveSolo(room: RoomView): void {
    const solo = this.solo;
    if (solo === null || room.status !== 'WAITING' || solo.stage === 'started') return;
    // Une carte refusée ne se corrige pas depuis la partie: inutile d'aller plus loin.
    if (room.startBlockers.includes('MAP_INVALID')) {
      this.abandonSolo();
      return;
    }
    const local = room.players.find((player) => player.id === this.appState.sessionId);
    if (local === undefined) return;
    if (solo.stage === 'equip') {
      const loadout = this.deps.screens.lobby.currentLoadout();
      if (loadout === null) {
        this.abandonSolo();
        return;
      }
      solo.stage = 'ready';
      this.send({ type: 'setLoadout', loadout });
      return;
    }
    if (!local.loadoutValid) return;
    if (solo.stage === 'ready') {
      if (local.ready) solo.stage = 'start';
      else this.send({ type: 'setReady', ready: true });
      if (solo.stage !== 'start') return;
    }
    // La carte se charge en arrière-plan: l'absence provisoire de carte n'est pas un refus.
    const blocking = room.startBlockers.filter((blocker) => blocker !== 'MAP_MISSING');
    if (blocking.length > 0) {
      this.abandonSolo();
      return;
    }
    if (room.startBlockers.length === 0 && room.hostId === this.appState.sessionId) {
      solo.stage = 'started';
      this.send({ type: 'startMatch' });
    }
  }

  // Une partie en solo qui bute sur un refus montre le salon: le joueur y lit ce qui bloque.
  private abandonSolo(): void {
    this.solo = null;
    this.intent = 'lobby';
    if (this.appState.room !== null) this.appState = { ...this.appState, screen: 'lobby' };
  }

  private endSolo(): void {
    const solo = this.solo;
    if (solo === null) return;
    this.solo = null;
    this.intent = solo.mode === 'test' ? 'stay' : 'lobby';
    this.soloStatus(SOLO_TEXTS[solo.mode].ended, solo.mode);
  }

  private soloStatus(status: string, mode: SoloMode | undefined = this.solo?.mode): void {
    if (mode === 'test') this.deps.screens.editor.setStatus(status);
    else this.setStatus(status);
  }

  private requestMaps(): void {
    if (this.mapsRequested) return;
    this.mapsRequested = true;
    this.send({ type: 'listMaps' });
  }

  private handleClose(): void {
    const { game } = this.deps;
    if (game.active) game.endMatch();
    this.connected = false;
    this.connecting = false;
    this.mapsRequested = false;
    // Une coupure annule la partie en solo en vol: la sauvegarde suivante ne doit pas ouvrir de salle.
    this.pendingTest = false;
    this.solo = null;
    this.appState = {
      ...this.appState,
      screen: 'home',
      sessionId: null,
      room: null,
      account: null,
      queue: { queued: false, size: 0 },
      status: DISCONNECTED,
    };
    this.showError(DISCONNECTED);
  }

  private setStatus(status: string): void {
    this.lastError = null;
    this.appState = { ...this.appState, status };
    this.render();
  }

  private showError(message: string): void {
    this.lastError = message;
    // L'écran cible doit être monté avant de recevoir l'erreur: un montage efface les erreurs périmées.
    this.render();
    this.routeError(message);
  }

  private routeError(message: string): void {
    const { game, screens } = this.deps;
    switch (screenFor(this.appState)) {
      case 'game':
        game.setStatus(`Erreur : ${message}`);
        return;
      case 'lobby':
        screens.lobby.showError(message);
        return;
      case 'editor':
        screens.editor.showError(message);
        return;
      default:
        screens.home.showError(message);
    }
  }

  private render(): void {
    const { screens, uiRoot } = this.deps;
    const target = screenFor(this.appState);
    if (target !== this.mounted) {
      this.screenOf(this.mounted)?.unmount();
      this.mounted = target;
      this.screenOf(target)?.mount(uiRoot);
    }
    const room = this.appState.room;
    // Une erreur déjà listée ne se répète pas dans la ligne d'état.
    if (target === 'home') {
      screens.home.setStatus(this.appState.status === this.lastError ? '' : this.appState.status);
    }
    // Le compte et le classement ne sont repoussés qu'à leur changement: la liste se redessine entière.
    if (this.renderedAccount !== this.appState.account) {
      this.renderedAccount = this.appState.account;
      screens.home.setAccount(this.appState.account);
    }
    if (this.renderedLeaderboard !== this.appState.leaderboard) {
      this.renderedLeaderboard = this.appState.leaderboard;
      screens.home.setLeaderboard(this.appState.leaderboard);
    }
    if (this.renderedQueue !== this.appState.queue) {
      this.renderedQueue = this.appState.queue;
      screens.home.setQueue(this.appState.queue.queued, this.appState.queue.size);
    }
    if (target === 'lobby' && room !== null) {
      screens.lobby.update(room, this.appState.maps, this.appState.sessionId ?? '');
    }
    // La liste n'est repoussée qu'à son changement: sinon elle écraserait la carte en cours d'édition.
    if (target === 'editor' && this.renderedMaps !== this.appState.maps) {
      this.renderedMaps = this.appState.maps;
      screens.editor.setMaps(this.appState.maps);
    }
  }

  private screenOf(id: ScreenId | null): Screen | null {
    const { screens } = this.deps;
    switch (id) {
      case 'home':
        return screens.home;
      case 'lobby':
        return screens.lobby;
      case 'editor':
        return screens.editor;
      default:
        return null;
    }
  }
}

function optionalPassword(password: string): { password?: string } {
  const trimmed = password.trim();
  return trimmed.length === 0 ? {} : { password: trimmed };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
