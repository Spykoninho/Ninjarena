import type { Screen } from '../app/screen';

export interface HomeActions {
  createRoom(name: string, password: string): void;
  joinRoom(name: string, code: string, password: string): void;
  openEditor(): void;
}

const NAME_MAX_LENGTH = 24;
const CODE_MAX_LENGTH = 6;

export class HomeScreen implements Screen {
  private readonly actions: HomeActions;
  private readonly root: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly createPasswordInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly joinPasswordInput: HTMLInputElement;
  private readonly statusLine: HTMLElement;
  private readonly errorList: HTMLElement;

  constructor(actions: HomeActions, initial: { name: string; roomCode: string }) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'screen home';
    element('h1', 'home-title', this.root).textContent = 'Ninjarena';

    this.nameInput = field(this.root, 'Name', 'text');
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.value = initial.name;

    const createRow = element('div', 'home-actions', this.root);
    this.createPasswordInput = field(createRow, 'Room password (optional)', 'password');
    createRow.appendChild(this.button('Create a room', () => this.onCreate()));

    const joinRow = element('div', 'home-actions', this.root);
    this.codeInput = field(joinRow, 'Room code', 'text');
    this.codeInput.maxLength = CODE_MAX_LENGTH;
    this.codeInput.value = initial.roomCode;
    // Les codes de salle sont en majuscules: la saisie est normalisée à la volée.
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase();
    });
    this.joinPasswordInput = field(joinRow, 'Password', 'password');
    joinRow.appendChild(this.button('Join', () => this.onJoin()));

    const editorRow = element('div', 'home-actions', this.root);
    editorRow.appendChild(
      this.button('Map editor', () => {
        this.actions.openEditor();
      }),
    );

    this.statusLine = element('div', 'home-status', this.root);
    this.errorList = element('ul', 'home-errors', this.root);
    this.errorList.setAttribute('aria-live', 'polite');
  }

  mount(root: HTMLElement): void {
    root.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  setStatus(status: string): void {
    this.statusLine.textContent = status;
  }

  showError(message: string): void {
    this.errorList.replaceChildren();
    element('li', 'home-error', this.errorList).textContent = message;
  }

  private onCreate(): void {
    this.errorList.replaceChildren();
    this.actions.createRoom(this.nameInput.value.trim(), this.createPasswordInput.value);
  }

  private onJoin(): void {
    this.errorList.replaceChildren();
    const code = this.codeInput.value.trim().toUpperCase();
    if (code.length === 0) {
      this.showError('a room code is required to join');
      return;
    }
    this.actions.joinRoom(this.nameInput.value.trim(), code, this.joinPasswordInput.value);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}

function field(parent: HTMLElement, label: string, type: string): HTMLInputElement {
  const wrapper = element('label', 'home-field', parent);
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.className = 'home-input';
  wrapper.appendChild(input);
  return input;
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
