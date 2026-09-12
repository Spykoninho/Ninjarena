import type { GameContent } from '@ninjarena/content';
import type { MapSummary } from '@ninjarena/core';
import type { ClientMessage, ServerMessage } from '@ninjarena/protocol';
import { PROTOCOL_VERSION } from '@ninjarena/protocol';
import type { ClientConfig } from '../config/clientConfig';
import type { ClientGame } from '../game/clientGame';
import type { NetworkClient } from '../network/networkClient';
import type { EditorScreen } from '../ui/editorScreen';
import type { HomeScreen } from '../ui/homeScreen';
import type { LobbyScreen } from '../ui/lobbyScreen';
import { initialAppState, reduceServerMessage, screenFor } from './appModel';
import type { AppState, ReduceIntent } from './appModel';
import type { Screen, ScreenId } from './screen';

export interface ClientAppScreens {
  home: HomeScreen;
  lobby: LobbyScreen;
  editor: EditorScreen;
}

export interface ClientAppDeps {
  config: ClientConfig;
  content: GameContent;
  network: NetworkClient;
  game: ClientGame;
  screens: ClientAppScreens;
  stage: HTMLElement;
  uiRoot: HTMLElement;
}

const DISCONNECTED = 'disconnected: the server closed the connection';

export class ClientApp {
  private readonly deps: ClientAppDeps;
  private appState: AppState;
  private mounted: ScreenId | null = null;
  private intent: ReduceIntent = 'lobby';
  private name: string;
  private renderedMaps: MapSummary[] | null = null;
  private lastError: string | null = null;
  private connected = false;
  private connecting = false;

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

  createRoom(name: string, password: string): void {
    void this.withSession(name, () => {
      this.send({ type: 'createRoom', ...optionalPassword(password) });
    });
  }

  joinRoom(name: string, code: string, password: string): void {
    void this.withSession(name, () => {
      this.send({ type: 'joinRoom', code, ...optionalPassword(password) });
    });
  }

  openEditor(): void {
    // L'éditeur ne veut pas être quitté par une salle qu'il n'a pas demandée.
    this.intent = 'stay';
    this.appState = { ...this.appState, screen: 'editor' };
    this.render();
    if (this.connected) this.send({ type: 'listMaps' });
  }

  leaveEditor(): void {
    this.intent = 'lobby';
    this.appState = { ...this.appState, screen: 'home' };
    this.render();
  }

  private async withSession(name: string, action: () => void): Promise<void> {
    const trimmed = name.trim();
    const renamed = trimmed.length > 0 && trimmed !== this.name;
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
    this.setStatus(`connecting to ${config.serverUrl}`);
    try {
      await network.connect(config.serverUrl);
    } catch (error) {
      this.showError(`failed to connect: ${reasonOf(error)}`);
      return false;
    } finally {
      this.connecting = false;
    }
    this.connected = true;
    this.sendHello();
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
    if (this.appState.screen === 'game' && next.screen !== 'game' && game.active) game.endMatch();
    this.appState = next;
    this.applyMessage(message);
    this.render();
  }

  private applyMessage(message: ServerMessage): void {
    const { game, screens } = this.deps;
    switch (message.type) {
      case 'roomState':
        game.setRoomPlayers(message.room.players);
        return;
      case 'matchStarted':
        this.intent = 'lobby';
        game.beginMatch(message, this.appState.room?.players ?? []);
        return;
      case 'mapDocument':
        screens.editor.showDocument(message.document);
        return;
      case 'error':
        this.showError(message.message);
        return;
      default:
        return;
    }
  }

  private handleClose(): void {
    const { game } = this.deps;
    if (game.active) game.endMatch();
    this.connected = false;
    this.connecting = false;
    this.appState = {
      ...this.appState,
      screen: 'home',
      sessionId: null,
      room: null,
      status: DISCONNECTED,
    };
    this.showError(DISCONNECTED);
    this.render();
  }

  private setStatus(status: string): void {
    this.lastError = null;
    this.appState = { ...this.appState, status };
    this.render();
  }

  private showError(message: string): void {
    const { game, screens } = this.deps;
    this.lastError = message;
    switch (screenFor(this.appState)) {
      case 'game':
        game.setStatus(`error: ${message}`);
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
