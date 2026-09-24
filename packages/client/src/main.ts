import { loadContent } from '@ninjarena/content';
import { ClientApp } from './app/clientApp';
import { SessionStore } from './app/sessionStore';
import { WebAudioSynth } from './audio/webAudioSynth';
import { loadClientConfig, sameOriginServerUrl } from './config/clientConfig';
import { ClientGame } from './game/clientGame';
import { DEFAULT_BINDINGS } from './input/bindings';
import { BindingsStore } from './input/bindingsStore';
import { DomInputAdapter } from './input/domInputAdapter';
import { enterFullscreen, isFullscreenShortcut, toggleFullscreen } from './input/fullscreen';
import { createInputState } from './input/inputState';
import { usesTouchControls } from './input/touchDevice';
import { createTouchState } from './input/touchInput';
import { NetworkClient } from './network/networkClient';
import { PixiRenderer } from './rendering/pixiRenderer';
import './styles.css';
import { EditorScreen } from './ui/editorScreen';
import { HomeScreen } from './ui/homeScreen';
import { Hud } from './ui/hud';
import { KeyBindingsPanel } from './ui/keyBindingsPanel';
import {
  abilityOption,
  basicOptions,
  createLoadoutState,
  slotBindings,
  techniqueOptions,
} from './ui/loadoutModel';
import { LoadoutPanel } from './ui/loadoutPanel';
import { LobbyScreen } from './ui/lobbyScreen';
import { TouchControls } from './ui/touchControls';

const stage = document.querySelector<HTMLElement>('#app');
const hudRoot = document.querySelector<HTMLElement>('#hud');
const uiRoot = document.querySelector<HTMLElement>('#ui');
if (stage === null || hudRoot === null || uiRoot === null) {
  throw new Error('missing #app, #hud or #ui element');
}

const DEFAULT_TILESET_ID = 'default';
const DEFAULT_CHARACTER_ID = 'ninja';

const config = loadClientConfig(
  window.location.search,
  sameOriginServerUrl(window.location, import.meta.env.BASE_URL),
);
const content = loadContent();
const inputState = createInputState();
const input = new DomInputAdapter(stage, inputState);
input.attach();
window.addEventListener('keydown', (event) => {
  if (isFullscreenShortcut(event, DEFAULT_BINDINGS.fullscreen)) void toggleFullscreen();
});

// Les touches d'attaque se règlent en jeu et survivent au rechargement de la page.
const bindings = new BindingsStore(localStorageOrNull());
const keysPanel = new KeyBindingsPanel(bindings);

const rules = content.statRules;
const techniques = techniqueOptions(content.abilities);
const basics = basicOptions(content.abilities);
// L'esquive n'est pas un choix: le salon la montre pour que la touche soit connue avant le combat.
const dash = abilityOption(
  content.abilities.get(content.characters.get(DEFAULT_CHARACTER_ID).dashId),
);
const loadoutPanel = new LoadoutPanel(
  rules,
  content.characters.get(DEFAULT_CHARACTER_ID).baseStats,
  techniques,
  basics,
  dash,
  slotBindings(bindings.current, rules.techniqueSlots),
);
bindings.subscribe((current) => {
  loadoutPanel.setKeys(slotBindings(current, rules.techniqueSlots));
});

const hud = new Hud(hudRoot, keysPanel, loadoutPanel);
// Un téléphone joue au doigt: le calque tactile n'existe que là, l'ordinateur ne voit rien de plus.
const touch = usesTouchControls(config.touch, (query) => window.matchMedia(query).matches)
  ? new TouchControls(createTouchState(), () => {
      inputState.pressedOnce.add(bindings.current.spectateNext);
    })
  : null;
if (touch !== null) {
  // Sous le HUD: le coin, le menu de pause et le bilan restent touchables par-dessus les commandes.
  document.body.insertBefore(touch.root, hudRoot);
  document.documentElement.classList.add('is-touch');
  hud.enableMenuButton();
  // Le manifeste n'est posé qu'au doigt: sur ordinateur, le navigateur proposerait d'installer le jeu.
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = `${import.meta.env.BASE_URL}manifest.webmanifest`;
  document.head.appendChild(manifest);
  // Le plein écran exige un geste: chaque toucher le redemande tant que la page n'y est pas.
  document.addEventListener(
    'pointerup',
    () => {
      void enterFullscreen();
    },
    { capture: true },
  );
}

const network = new NetworkClient();
const game = new ClientGame({
  content,
  network,
  renderer: new PixiRenderer({ zoom: config.zoom, clampToMap: touch === null }),
  hud,
  audio: new WebAudioSynth(),
  inputState,
  bindings: bindings.current,
  touch,
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
    createRoom: (name, password, settings) => {
      app().createRoom(name, password, settings);
    },
    createSandbox: (name) => {
      app().createSandbox(name);
    },
    joinQueue: (name) => {
      app().joinQueue(name);
    },
    leaveQueue: () => {
      app().leaveQueue();
    },
    joinRoom: (name, code, password) => {
      app().joinRoom(name, code, password);
    },
    login: (name, password) => {
      app().login(name, password);
    },
    register: (name, password) => {
      app().register(name, password);
    },
    logout: () => {
      app().logout();
    },
    openLeaderboard: () => {
      app().openLeaderboard();
    },
    openEditor: () => {
      app().openEditor();
    },
  },
  { name: config.playerName, roomCode: config.roomCode },
);

const lobby = new LobbyScreen(
  {
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
  },
  loadoutPanel,
  keysPanel,
  rules,
  [...basics, dash, ...techniques],
);

// L'état initial n'est posé qu'une fois l'écran branché: il vaut premier changement de loadout.
loadoutPanel.setState(
  createLoadoutState(config, rules, techniques, basics, rules.defaultPointBudget),
);

const editor = new EditorScreen(
  {
    saveMap: (document) => {
      app().send({ type: 'saveMap', document });
    },
    listMaps: () => {
      app().send({ type: 'listMaps' });
    },
    getMap: (id) => {
      app().send({ type: 'getMap', id });
    },
    deleteMap: (id) => {
      app().send({ type: 'deleteMap', id });
    },
    testMap: (document) => {
      app().testMap(document);
    },
    back: () => {
      app().leaveEditor();
    },
  },
  content.tilesets.get(DEFAULT_TILESET_ID),
  'Nouvelle carte',
);

deferred.app = new ClientApp({
  config,
  content,
  network,
  game,
  screens: { home, lobby, editor },
  // Le compte survit au rechargement de la page: son jeton reste dans le navigateur.
  session: new SessionStore(localStorageOrNull()),
  stage,
  uiRoot,
});

window.addEventListener('beforeunload', () => {
  input.detach();
  app().stop();
});

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Pas de `await` au niveau module: en build, les chunks Pixi importent celui-ci et un top-level await bloquerait leur chargement.
app()
  .start()
  .catch((error: unknown) => {
    console.error('failed to start the client', error);
  });
