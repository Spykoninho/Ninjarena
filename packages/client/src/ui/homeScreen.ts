import type { RoomSettingsPatch, TournamentSize } from '@ninjarena/core';
import { TOURNAMENT_SIZES } from '@ninjarena/core';
import type { AccountView } from '@ninjarena/protocol';
import type { Screen } from '../app/screen';
import { isRoomCode } from '../lobby/lobbyModel';
import { rankBadge, ratingText } from './rankBadge';

export interface HomeActions {
  createRoom(name: string, password: string, settings: RoomSettingsPatch): void;
  createSandbox(name: string): void;
  joinQueue(name: string): void;
  leaveQueue(): void;
  joinRoom(name: string, code: string, password: string): void;
  login(name: string, password: string): void;
  register(name: string, password: string): void;
  logout(): void;
  openLeaderboard(): void;
  openEditor(): void;
}

// `create` est le choix du type de partie; `custom` et `tournament` sont ses formulaires.
type HomeMode =
  'menu' | 'create' | 'custom' | 'tournament' | 'queue' | 'join' | 'login' | 'leaderboard';

const NAME_MODES: HomeMode[] = ['create', 'custom', 'tournament', 'join'];
const RANKED_NEEDS_ACCOUNT = 'Connecte-toi à un compte pour jouer en classé';

interface MenuEntry {
  title: string;
  hint: string;
  onClick: () => void;
}

const NAME_MAX_LENGTH = 24;
const CODE_MAX_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 64;

export class HomeScreen implements Screen {
  private readonly actions: HomeActions;
  private readonly root: HTMLElement;
  private readonly accountBar: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly identity: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly createForm: HTMLFormElement;
  private readonly tournamentForm: HTMLFormElement;
  private readonly queuePanel: HTMLElement;
  private readonly queueCount: HTMLElement;
  private readonly joinForm: HTMLFormElement;
  private readonly loginForm: HTMLFormElement;
  private readonly createPasswordInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly joinPasswordInput: HTMLInputElement;
  private readonly accountNameInput: HTMLInputElement;
  private readonly accountPasswordInput: HTMLInputElement;
  private readonly leaderboard: HTMLElement;
  private readonly leaderboardBody: HTMLElement;
  private readonly leaderboardEmpty: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly errorList: HTMLElement;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private mode: HomeMode = 'menu';
  private account: AccountView | null = null;
  private tournamentSize: TournamentSize = 4;
  private mountedOnce = false;

  constructor(actions: HomeActions, initial: { name: string; roomCode: string }) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'screen home';
    element('h1', 'home-title', this.root).textContent = 'Ninjarena';
    element('p', 'home-tagline', this.root).textContent =
      'Choisis tes techniques, mets-toi prêt, et bats-toi en manches courtes.';

    this.accountBar = element('div', 'home-account', this.root);

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
        title: 'Classement',
        hint: 'Les comptes classés, du plus fort au plus récent',
        onClick: () => {
          this.setMode('leaderboard');
          this.actions.openLeaderboard();
        },
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

    this.picker = element('section', 'home-picker', this.root);
    this.picker.hidden = true;
    element('h2', 'home-form-title', this.picker).textContent = 'Quel genre de partie ?';
    const kinds: MenuEntry[] = [
      {
        title: 'Bac à sable',
        hint: 'Balade-toi seul sur la carte, sans chrono, pour essayer ton build',
        onClick: () => this.onSandbox(),
      },
      {
        title: 'Tournoi',
        hint: '4 ou 8 joueurs tirés au sort dans un arbre, des duels à la suite',
        onClick: () => this.setMode('tournament'),
      },
      {
        title: 'Partie classée',
        hint: 'File d’attente : un adversaire de ton niveau, ton score en jeu',
        onClick: () => this.onRanked(),
      },
      {
        title: 'Partie personnalisée',
        hint: 'Ouvre une salle, choisis tous les réglages et partage son code',
        onClick: () => this.setMode('custom'),
      },
    ];
    const kindList = element('div', 'home-menu', this.picker);
    for (const entry of kinds) kindList.appendChild(menuButton(entry));
    const pickerActions = element('div', 'home-form-actions', this.picker);
    pickerActions.appendChild(this.backButton());

    this.createForm = this.form('Partie personnalisée', () => this.onCreate());
    this.createPasswordInput = field(
      this.createForm,
      'Mot de passe de la salle (facultatif)',
      'password',
    );
    this.createForm.appendChild(this.formActions(this.createForm, 'Créer'));

    this.tournamentForm = this.form('Tournoi', () => this.onTournament());
    element('p', 'home-form-hint', this.tournamentForm).textContent =
      'Les joueurs rejoignent la salle par son code ; l’arbre se tire au sort au lancement et ceux qui ne jouent pas regardent le duel en cours.';
    const sizes = element('div', 'home-sizes', this.tournamentForm);
    for (const size of TOURNAMENT_SIZES) {
      const choice = actionButton(`${size} joueurs`, 'home-size', () => {
        this.tournamentSize = size;
        for (const node of sizes.children) {
          node.classList.toggle('is-picked', node === choice);
        }
      });
      choice.classList.toggle('is-picked', size === this.tournamentSize);
      sizes.appendChild(choice);
    }
    this.tournamentForm.appendChild(this.formActions(this.tournamentForm, 'Ouvrir le tournoi'));

    this.queuePanel = element('section', 'home-queue', this.root);
    this.queuePanel.hidden = true;
    element('h2', 'home-form-title', this.queuePanel).textContent = 'Partie classée';
    element('p', 'home-queue-search', this.queuePanel).textContent =
      'Recherche d’un adversaire de ton niveau…';
    this.queueCount = element('p', 'home-queue-count', this.queuePanel);
    const queueActions = element('div', 'home-form-actions', this.queuePanel);
    queueActions.appendChild(
      actionButton('Annuler', 'home-back', () => {
        this.actions.leaveQueue();
        this.setMode('menu');
      }),
    );

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

    this.loginForm = this.form('Compte', () => this.onLogin());
    element('p', 'home-form-hint', this.loginForm).textContent =
      'Un compte garde ton score et ton rang : il faut en avoir un pour jouer en classé.';
    this.accountNameInput = field(this.loginForm, 'Pseudo (unique)', 'text');
    this.accountNameInput.maxLength = NAME_MAX_LENGTH;
    this.accountNameInput.autocomplete = 'username';
    this.accountPasswordInput = field(this.loginForm, 'Mot de passe', 'password');
    this.accountPasswordInput.maxLength = PASSWORD_MAX_LENGTH;
    this.accountPasswordInput.autocomplete = 'current-password';
    const loginActions = this.formActions(this.loginForm, 'Se connecter');
    const register = document.createElement('button');
    register.type = 'button';
    register.className = 'home-register';
    register.textContent = 'Créer un compte';
    register.addEventListener('click', () => this.onRegister());
    loginActions.insertBefore(register, loginActions.lastChild);
    this.loginForm.appendChild(loginActions);

    this.leaderboard = element('section', 'home-leaderboard', this.root);
    this.leaderboard.hidden = true;
    element('h2', 'home-form-title', this.leaderboard).textContent = 'Classement';
    const table = element('table', 'home-leaderboard-table', this.leaderboard);
    const head = element('tr', '', element('thead', '', table));
    for (const label of ['#', 'Rang', 'Pseudo', 'Points', 'V / D']) {
      element('th', '', head).textContent = label;
    }
    this.leaderboardBody = element('tbody', '', table);
    this.leaderboardEmpty = element('p', 'home-leaderboard-empty', this.leaderboard);
    this.leaderboardEmpty.textContent =
      'Personne n’est encore classé : crée un compte et lance une partie classée.';
    const back = element('div', 'home-form-actions', this.leaderboard);
    back.appendChild(this.backButton());

    this.statusLine = element('div', 'home-status', this.root);
    this.errorList = element('ul', 'home-errors', this.root);
    this.errorList.setAttribute('aria-live', 'polite');
    this.onKeyDown = (event) => {
      if (event.key === 'Escape' && this.mode !== 'menu') this.setMode('menu');
    };
    this.renderAccount();
    // Un lien `?room=` mène droit au formulaire de connexion, code déjà rempli.
    this.setMode(initial.roomCode.length > 0 ? 'join' : 'menu');
  }

  mount(root: HTMLElement): void {
    // Une erreur ne survit pas au remontage de l'écran: elle parlait de la session précédente.
    this.errorList.replaceChildren();
    // Revenir d'une salle ramène au menu; le premier montage garde le formulaire qu'un lien a ouvert.
    if (this.mountedOnce && this.mode !== 'queue') this.setMode('menu');
    this.mountedOnce = true;
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

  setAccount(account: AccountView | null): void {
    const loggedIn = this.account === null && account !== null;
    this.account = account;
    this.renderAccount();
    this.identity.hidden = this.identityHidden();
    // Une connexion réussie ramène au menu: le formulaire de compte a fait son travail.
    if (loggedIn && this.mode === 'login') this.setMode('menu');
  }

  // La file se pilote depuis le serveur: l'écran suit son état plutôt que le clic.
  setQueue(queued: boolean, size: number): void {
    this.queueCount.textContent =
      size <= 1 ? 'Tu es seul en file pour l’instant' : `${size} joueurs en file`;
    if (queued && this.mode !== 'queue') this.setMode('queue');
    else if (!queued && this.mode === 'queue') this.setMode('menu');
  }

  setLeaderboard(entries: AccountView[]): void {
    this.leaderboardBody.replaceChildren();
    this.leaderboardEmpty.hidden = entries.length > 0;
    entries.forEach((entry, index) => {
      const row = element('tr', 'home-leaderboard-row', this.leaderboardBody);
      if (this.account !== null && entry.name === this.account.name) row.classList.add('is-local');
      element('td', 'home-leaderboard-position', row).textContent = `${index + 1}`;
      element('td', '', row).appendChild(rankBadge(entry.rating));
      element('td', 'home-leaderboard-name', row).textContent = entry.name;
      element('td', 'home-leaderboard-rating', row).textContent = `${entry.rating}`;
      element('td', 'home-leaderboard-record', row).textContent = `${entry.wins} / ${entry.losses}`;
    });
  }

  private renderAccount(): void {
    this.accountBar.replaceChildren();
    const account = this.account;
    if (account === null) {
      element('span', 'home-account-name', this.accountBar).textContent = 'Invité';
      element('span', 'home-account-hint', this.accountBar).textContent = 'sans classement';
      this.accountBar.appendChild(
        actionButton('Se connecter', 'home-account-action', () => this.setMode('login')),
      );
      return;
    }
    element('span', 'home-account-name', this.accountBar).textContent = account.name;
    this.accountBar.appendChild(rankBadge(account.rating));
    element('span', 'home-account-hint', this.accountBar).textContent =
      `${ratingText(account.rating)} · ${account.wins} V / ${account.losses} D`;
    this.accountBar.appendChild(
      actionButton('Déconnexion', 'home-account-action', () => {
        this.errorList.replaceChildren();
        this.actions.logout();
      }),
    );
  }

  private setMode(mode: HomeMode): void {
    this.mode = mode;
    this.errorList.replaceChildren();
    this.menu.hidden = mode !== 'menu';
    this.accountBar.hidden = mode !== 'menu';
    this.identity.hidden = this.identityHidden();
    this.picker.hidden = mode !== 'create';
    this.createForm.hidden = mode !== 'custom';
    this.tournamentForm.hidden = mode !== 'tournament';
    this.queuePanel.hidden = mode !== 'queue';
    this.joinForm.hidden = mode !== 'join';
    this.loginForm.hidden = mode !== 'login';
    this.leaderboard.hidden = mode !== 'leaderboard';
    if (this.root.isConnected) this.focus();
  }

  // Un compte impose son pseudo: le champ libre ne sert qu'aux invités.
  private identityHidden(): boolean {
    return !NAME_MODES.includes(this.mode) || this.account !== null;
  }

  private focus(): void {
    if (this.mode === 'join') {
      (this.codeInput.value.length > 0 ? this.joinPasswordInput : this.codeInput).focus();
    } else if (this.mode === 'custom') {
      (this.account === null ? this.nameInput : this.createPasswordInput).focus();
    } else if (this.mode === 'login') {
      this.accountNameInput.focus();
    }
  }

  private playerName(): string {
    return this.account?.name ?? this.nameInput.value.trim();
  }

  private onCreate(): void {
    this.errorList.replaceChildren();
    this.actions.createRoom(this.playerName(), this.createPasswordInput.value, {});
  }

  private onTournament(): void {
    this.errorList.replaceChildren();
    this.actions.createRoom(this.playerName(), '', {
      tournament: true,
      tournamentSize: this.tournamentSize,
    });
  }

  private onSandbox(): void {
    this.errorList.replaceChildren();
    this.actions.createSandbox(this.playerName());
  }

  // Sans compte la file refuserait: autant l'annoncer ici et ouvrir le formulaire de connexion.
  private onRanked(): void {
    if (this.account === null) {
      this.setMode('login');
      this.showError(RANKED_NEEDS_ACCOUNT);
      return;
    }
    this.errorList.replaceChildren();
    this.actions.joinQueue(this.playerName());
  }

  private onJoin(): void {
    this.errorList.replaceChildren();
    const code = this.codeInput.value.trim().toUpperCase();
    if (!isRoomCode(code)) {
      this.showError('un code de salle fait 6 lettres ou chiffres');
      return;
    }
    this.actions.joinRoom(this.playerName(), code, this.joinPasswordInput.value);
  }

  private onLogin(): void {
    const credentials = this.credentials();
    if (credentials !== null) this.actions.login(credentials.name, credentials.password);
  }

  private onRegister(): void {
    const credentials = this.credentials();
    if (credentials !== null) this.actions.register(credentials.name, credentials.password);
  }

  // Les bornes du serveur sont vérifiées ici pour éviter un aller-retour qui finirait en message générique.
  private credentials(): { name: string; password: string } | null {
    this.errorList.replaceChildren();
    const name = this.accountNameInput.value.trim();
    const password = this.accountPasswordInput.value;
    if (name.length < 2) {
      this.showError('un pseudo de compte fait au moins 2 caractères');
      return null;
    }
    if (password.length < 4) {
      this.showError('un mot de passe fait au moins 4 caractères');
      return null;
    }
    return { name, password };
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
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'home-submit';
    submit.textContent = submitLabel;
    row.append(this.backButton(), submit);
    return row;
  }

  private backButton(): HTMLButtonElement {
    return actionButton('Retour', 'home-back', () => this.setMode('menu'));
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

function actionButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
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
