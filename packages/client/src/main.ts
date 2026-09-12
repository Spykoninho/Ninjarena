import { loadContent } from '@ninjarena/content';
import { ClientApp } from './app/clientApp';
import { WebAudioSynth } from './audio/webAudioSynth';
import { loadClientConfig } from './config/clientConfig';
import { ClientGame } from './game/clientGame';
import { DEFAULT_BINDINGS } from './input/bindings';
import { DomInputAdapter } from './input/domInputAdapter';
import { createInputState } from './input/inputState';
import { NetworkClient } from './network/networkClient';
import { PixiRenderer } from './rendering/pixiRenderer';
import './styles.css';
import { EditorScreen } from './ui/editorScreen';
import { HomeScreen } from './ui/homeScreen';
import { Hud } from './ui/hud';
import { LobbyScreen } from './ui/lobbyScreen';

const stage = document.querySelector<HTMLElement>('#app');
const hudRoot = document.querySelector<HTMLElement>('#hud');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (stage === null || hudRoot === null || uiRoot === null) {
  throw new Error('missing #app, #hud or #ui element');
}

const config = loadClientConfig(window.location.search);
const content = loadContent();
const inputState = createInputState();
const input = new DomInputAdapter(stage, inputState);
input.attach();

const network = new NetworkClient();
const game = new ClientGame({
  content,
  network,
  renderer: new PixiRenderer({ zoom: config.zoom }),
  hud: new Hud(hudRoot),
  audio: new WebAudioSynth(),
  inputState,
  bindings: DEFAULT_BINDINGS,
  interpolationDelayTicks: config.interpolationDelayTicks,
});

// Les écrans parlent à l'application, qui n'existe qu'une fois ses écrans construits.
const deferred: { app: ClientApp | null } = { app: null };
function app(): ClientApp {
  const current = deferred.app;
  if (current === null) throw new Error('the client app is not wired yet');
  return current;
}

const home = new HomeScreen(
  {
    createRoom: (name, password) => {
      app().createRoom(name, password);
    },
    joinRoom: (name, code, password) => {
      app().joinRoom(name, code, password);
    },
    openEditor: () => {
      app().openEditor();
    },
  },
  { name: config.playerName, roomCode: config.roomCode },
);

const lobby = new LobbyScreen({
  updateSettings: (patch) => {
    app().send({ type: 'updateSettings', patch });
  },
  setLoadout: (loadout) => {
    app().send({ type: 'setLoadout', loadout });
  },
  setReady: (ready) => {
    app().send({ type: 'setReady', ready });
  },
  switchTeam: (team) => {
    app().send({ type: 'switchTeam', team });
  },
  startMatch: () => {
    app().send({ type: 'startMatch' });
  },
  leaveRoom: () => {
    app().send({ type: 'leaveRoom' });
  },
});

const editor = new EditorScreen({
  saveMap: (document) => {
    app().send({ type: 'saveMap', document });
  },
  listMaps: () => {
    app().send({ type: 'listMaps' });
  },
  getMap: (id) => {
    app().send({ type: 'getMap', id });
  },
  testMap: () => {
    // Le lancement d'essai arrive avec l'éditeur de la Task 10.
    editor.setStatus('not available yet');
  },
  back: () => {
    app().leaveEditor();
  },
});

deferred.app = new ClientApp({
  config,
  content,
  network,
  game,
  screens: { home, lobby, editor },
  stage,
  uiRoot,
});

window.addEventListener('beforeunload', () => {
  input.detach();
  app().stop();
});

try {
  await app().start();
} catch (error) {
  console.error('failed to start the client', error);
}
