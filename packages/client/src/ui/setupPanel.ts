import type { AttributeId, StatRulesDefinition } from '@ninjarena/core';
import { ATTRIBUTE_IDS } from '@ninjarena/core';
import { pointsLeft, setAttribute, setTechnique, setupErrors } from './setupModel';
import type { SetupState, TechniqueOption } from './setupModel';

const NAME_MAX_LENGTH = 24;
const MS_PER_SECOND = 1000;

interface AttributeRow {
  input: HTMLInputElement;
  valueLabel: HTMLElement;
}

export class SetupPanel {
  private readonly rules: StatRulesDefinition;
  private readonly options: TechniqueOption[];
  private readonly budget: number;
  private readonly root: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly pointsLabel: HTMLElement;
  private readonly attributeRows: Partial<Record<AttributeId, AttributeRow>> = {};
  private readonly selects: HTMLSelectElement[] = [];
  private readonly errorList: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private state: SetupState | null = null;
  private playHandler: ((state: SetupState) => void) | null = null;
  private serverError: string | null = null;

  constructor(
    root: HTMLElement,
    rules: StatRulesDefinition,
    options: TechniqueOption[],
    budget: number,
  ) {
    this.root = root;
    this.rules = rules;
    this.options = options;
    this.budget = budget;
    root.replaceChildren();
    const panel = element('div', 'setup-panel', root);
    element('h1', 'setup-title', panel).textContent = 'Ninjarena';

    const nameField = element('label', 'setup-field', panel);
    nameField.textContent = 'Name';
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.className = 'setup-name';
    nameField.appendChild(this.nameInput);
    this.nameInput.addEventListener('input', () => this.onNameChanged());

    this.pointsLabel = element('div', 'setup-points', panel);

    const attributesRoot = element('div', 'setup-attributes', panel);
    for (const id of ATTRIBUTE_IDS)
      this.attributeRows[id] = this.buildAttributeRow(attributesRoot, id);

    const techniquesRoot = element('div', 'setup-techniques', panel);
    for (let slot = 0; slot < rules.techniqueSlots; slot++) {
      this.selects.push(this.buildTechniqueSelect(techniquesRoot, slot));
    }

    this.errorList = element('ul', 'setup-errors', panel);

    this.playButton = document.createElement('button');
    this.playButton.type = 'button';
    this.playButton.className = 'setup-play';
    this.playButton.textContent = 'Play';
    panel.appendChild(this.playButton);
    this.playButton.addEventListener('click', () => this.onPlayClicked());
  }

  show(initial: SetupState): void {
    this.state = initial;
    this.serverError = null;
    this.nameInput.value = initial.name;
    for (const id of ATTRIBUTE_IDS) {
      const row = this.attributeRows[id];
      if (row === undefined) continue;
      row.input.value = String(initial.build[id]);
      row.valueLabel.textContent = String(initial.build[id]);
    }
    for (let slot = 0; slot < this.selects.length; slot++) {
      const select = this.selects[slot];
      if (select === undefined) continue;
      select.value = initial.techniqueIds[slot] ?? '';
    }
    this.root.hidden = false;
    this.refresh();
  }

  hide(): void {
    this.root.hidden = true;
  }

  onPlay(handler: (state: SetupState) => void): void {
    this.playHandler = handler;
  }

  showError(message: string): void {
    this.serverError = message;
    this.root.hidden = false;
    this.refresh();
  }

  private buildAttributeRow(parent: HTMLElement, id: AttributeId): AttributeRow {
    const range = this.rules.attributes[id];
    const row = element('label', 'setup-attribute', parent);
    element('span', 'setup-attribute-name', row).textContent = capitalize(id);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = '1';
    row.appendChild(input);
    const valueLabel = element('span', 'setup-attribute-value', row);
    input.addEventListener('input', () => this.onAttributeChanged(id, input, valueLabel));
    return { input, valueLabel };
  }

  private buildTechniqueSelect(parent: HTMLElement, slot: number): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'setup-technique';
    for (const option of this.options) {
      const entry = document.createElement('option');
      entry.value = option.id;
      const cooldownSeconds = (option.cooldownMs / MS_PER_SECOND).toFixed(1);
      entry.textContent = `${option.name} · ${option.chakraCost} chakra · ${cooldownSeconds}s`;
      select.appendChild(entry);
    }
    parent.appendChild(select);
    select.addEventListener('change', () => this.onTechniqueChanged(slot, select.value));
    return select;
  }

  private onNameChanged(): void {
    if (this.state === null) return;
    this.state = { ...this.state, name: this.nameInput.value };
    this.refresh();
  }

  private onAttributeChanged(
    id: AttributeId,
    input: HTMLInputElement,
    valueLabel: HTMLElement,
  ): void {
    if (this.state === null) return;
    const requested = Number.parseInt(input.value, 10);
    this.state = setAttribute(this.state, id, requested, this.rules, this.budget);
    input.value = String(this.state.build[id]);
    valueLabel.textContent = String(this.state.build[id]);
    this.refresh();
  }

  private onTechniqueChanged(slot: number, id: string): void {
    if (this.state === null) return;
    this.state = setTechnique(this.state, slot, id, this.options);
    for (let i = 0; i < this.selects.length; i++) {
      const select = this.selects[i];
      if (select === undefined) continue;
      select.value = this.state.techniqueIds[i] ?? '';
    }
    this.refresh();
  }

  private onPlayClicked(): void {
    const state = this.state;
    if (state === null || this.playHandler === null) return;
    if (setupErrors(state, this.rules, this.budget, this.options).length > 0) return;
    this.playHandler(state);
  }

  private refresh(): void {
    const state = this.state;
    if (state === null) return;
    this.pointsLabel.textContent = `${pointsLeft(state, this.rules, this.budget)} points left`;
    const errors = setupErrors(state, this.rules, this.budget, this.options);
    const messages = this.serverError === null ? errors : [this.serverError, ...errors];
    this.errorList.replaceChildren();
    for (const message of messages)
      element('li', 'setup-error', this.errorList).textContent = message;
    this.playButton.disabled = errors.length > 0;
  }
}

function capitalize(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
