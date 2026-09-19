import type { Screen } from '../app/screen';
import { isRoomCode } from '../lobby/lobbyModel';

export interface HomeActions {
  createRoom(name: string, password: string): void;
  joinRoom(name: string, code: string, password: string): void;
  openEditor(): void;
}

type HomeMode = 'menu' | 'create' | 'join';

interface MenuEntry {
  title: string;
  hint: string;
  onClick: () => void;
}

const NAME_MAX_LENGTH = 24;
const CODE_MAX_LENGTH = 6;

export class HomeScreen implements Screen {
  private readonly actions: HomeActions;
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly identity: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly createForm: HTMLFormElement;
  private readonly joinForm: HTMLFormElement;
  private readonly createPasswordInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly joinPasswordInput: HTMLInputElement;
  private readonly statusLine: HTMLElement;
  private readonly errorList: HTMLElement;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private mode: HomeMode = 'menu';

  constructor(actions: HomeActions, initial: { name: string; roomCode: string }) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'screen home';
    element('h1', 'home-title', this.root).textContent = 'Ninjarena';
    element('p', 'home-tagline', this.root).textContent =
      'Choisis tes techniques, mets-toi prêt, et bats-toi en manches courtes.';

    this.menu = element('div', 'home-menu', this.root);
    const entries: MenuEntry[] = [
      {
        title: 'Créer une partie',
        hint: 'Ouvre une salle et partage son code à tes amis',
        onClick: () => this.setMode('create'),
      },
      {
        title: 'Rejoindre une partie',
        hint: 'Entre le code d’une salle déjà ouverte',
        onClick: () => this.setMode('join'),
      },
      {
        title: 'Éditeur de cartes',
        hint: 'Construis, vérifie et teste ta propre arène',
        onClick: () => {
          this.actions.openEditor();
        },
      },
    ];
    for (const entry of entries) this.menu.appendChild(menuButton(entry));

    this.identity = element('div', 'home-identity', this.root);
    this.nameInput = field(this.identity, 'Ton pseudo', 'text');
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.value = initial.name;

    this.createForm = this.form('Créer une partie', () => this.onCreate());
    this.createPasswordInput = field(
      this.createForm,
      'Mot de passe de la salle (facultatif)',
      'password',
    );
    this.createForm.appendChild(this.formActions(this.createForm, 'Créer'));

    this.joinForm = this.form('Rejoindre une partie', () => this.onJoin());
    this.codeInput = field(this.joinForm, 'Code de la salle', 'text');
    this.codeInput.className += ' home-code';
    this.codeInput.maxLength = CODE_MAX_LENGTH;
    this.codeInput.placeholder = 'ABC123';
    this.codeInput.autocomplete = 'off';
    this.codeInput.value = initial.roomCode;
    // Les codes de salle sont en majuscules: la saisie est normalisée à la volée.
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase();
    });
    this.joinPasswordInput = field(this.joinForm, 'Mot de passe (si la salle en a un)', 'password');
    this.joinForm.appendChild(this.formActions(this.joinForm, 'Rejoindre'));

    this.statusLine = element('div', 'home-status', this.root);
    this.errorList = element('ul', 'home-errors', this.root);
    this.errorList.setAttribute('aria-live', 'polite');
    this.onKeyDown = (event) => {
      if (event.key === 'Escape' && this.mode !== 'menu') this.setMode('menu');
    };
    // Un lien `?room=` mène droit au formulaire de connexion, code déjà rempli.
    this.setMode(initial.roomCode.length > 0 ? 'join' : 'menu');
  }

  mount(root: HTMLElement): void {
    // Une erreur ne survit pas au remontage de l'écran: elle parlait de la session précédente.
    this.errorList.replaceChildren();
    root.appendChild(this.root);
    this.root.addEventListener('keydown', this.onKeyDown);
    this.focus();
  }

  unmount(): void {
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  setStatus(status: string): void {
    this.statusLine.textContent = status;
  }

  showError(message: string): void {
    this.errorList.replaceChildren();
    element('li', 'home-error', this.errorList).textContent = message;
  }

  private setMode(mode: HomeMode): void {
    this.mode = mode;
    this.errorList.replaceChildren();
    this.menu.hidden = mode !== 'menu';
    this.identity.hidden = mode === 'menu';
    this.createForm.hidden = mode !== 'create';
    this.joinForm.hidden = mode !== 'join';
    if (this.root.isConnected) this.focus();
  }

  private focus(): void {
    if (this.mode === 'join') {
      (this.codeInput.value.length > 0 ? this.joinPasswordInput : this.codeInput).focus();
    } else if (this.mode === 'create') {
      this.nameInput.focus();
    }
  }

  private onCreate(): void {
    this.errorList.replaceChildren();
    this.actions.createRoom(this.nameInput.value.trim(), this.createPasswordInput.value);
  }

  private onJoin(): void {
    this.errorList.replaceChildren();
    const code = this.codeInput.value.trim().toUpperCase();
    if (!isRoomCode(code)) {
      this.showError('un code de salle fait 6 lettres ou chiffres');
      return;
    }
    this.actions.joinRoom(this.nameInput.value.trim(), code, this.joinPasswordInput.value);
  }

  // Un formulaire soumet sur Entrée depuis n'importe quel champ: le bouton n'est qu'une commodité.
  private form(title: string, onSubmit: () => void): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'home-form';
    form.hidden = true;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      onSubmit();
    });
    element('h2', 'home-form-title', form).textContent = title;
    this.root.appendChild(form);
    return form;
  }

  private formActions(form: HTMLFormElement, submitLabel: string): HTMLElement {
    const row = element('div', 'home-form-actions', form);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-back';
    back.textContent = 'Retour';
    back.addEventListener('click', () => this.setMode('menu'));
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'home-submit';
    submit.textContent = submitLabel;
    row.append(back, submit);
    return row;
  }
}

function menuButton(entry: MenuEntry): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'home-menu-button';
  element('span', 'home-menu-title', button).textContent = entry.title;
  element('span', 'home-menu-hint', button).textContent = entry.hint;
  button.addEventListener('click', entry.onClick);
  return button;
}

function field(parent: HTMLElement, label: string, type: string): HTMLInputElement {
  const wrapper = element('label', 'home-field', parent);
  element('span', 'home-field-label', wrapper).textContent = label;
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
