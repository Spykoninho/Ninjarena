import { loadContent } from '@ninjarena/content';
import { NullAudio } from './audio/audioPort';
import { loadClientConfig } from './config/clientConfig';
import { ClientGame } from './game/clientGame';
import { DEFAULT_BINDINGS } from './input/bindings';
import { DomInputAdapter } from './input/domInputAdapter';
import { createInputState } from './input/inputState';
import { NetworkClient } from './network/networkClient';
import { PixiRenderer } from './rendering/pixiRenderer';
import './styles.css';
import { Hud } from './ui/hud';

const stage = document.querySelector<HTMLElement>('#app');
const hudRoot = document.querySelector<HTMLElement>('#hud');
if (stage === null || hudRoot === null) throw new Error('missing #app or #hud element');

const config = loadClientConfig(window.location.search);
const inputState = createInputState();
const input = new DomInputAdapter(stage, inputState);
input.attach();

const game = new ClientGame({
  config,
  content: loadContent(),
  network: new NetworkClient(),
  renderer: new PixiRenderer({ zoom: config.zoom }),
  hud: new Hud(hudRoot),
  audio: new NullAudio(),
  inputState,
  bindings: DEFAULT_BINDINGS,
});

window.addEventListener('beforeunload', () => {
  input.detach();
  game.stop();
});

try {
  await game.start(stage);
} catch (error) {
  console.error('failed to start the client', error);
}
