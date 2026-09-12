import type { AttributeId, Loadout, StatRulesDefinition } from '@ninjarena/core';
import { ATTRIBUTE_IDS } from '@ninjarena/core';
import { loadoutErrors, pointsLeft, setAttribute, setTechnique, toLoadout } from './loadoutModel';
import type { BasicOption, LoadoutState, TechniqueOption } from './loadoutModel';

const MS_PER_SECOND = 1000;

interface AttributeRow {
  input: HTMLInputElement;
  valueLabel: HTMLElement;
}

export class LoadoutPanel {
  private readonly rules: StatRulesDefinition;
  private readonly techniques: TechniqueOption[];
  private readonly root: HTMLElement;
  private readonly pointsLabel: HTMLElement;
  private readonly attributeRows: Partial<Record<AttributeId, AttributeRow>> = {};
  private readonly basicSelect: HTMLSelectElement;
  private readonly techniqueSelects: HTMLSelectElement[] = [];
  private readonly errorList: HTMLElement;
  private readonly verdictLine: HTMLElement;
  private budget: number;
  private state: LoadoutState | null = null;
  private changeHandler: ((loadout: Loadout | null) => void) | null = null;

  constructor(rules: StatRulesDefinition, techniques: TechniqueOption[], basics: BasicOption[]) {
    this.rules = rules;
    this.techniques = techniques;
    this.budget = rules.defaultPointBudget;
    this.root = document.createElement('div');
    this.root.className = 'lobby-loadout';
    element('h2', 'lobby-section-title', this.root).textContent = 'Loadout';
    this.pointsLabel = element('div', 'loadout-points', this.root);

    const attributesRoot = element('div', 'loadout-attributes', this.root);
    for (const id of ATTRIBUTE_IDS) {
      this.attributeRows[id] = this.buildAttributeRow(attributesRoot, id);
    }

    this.basicSelect = this.buildBasicSelect(this.root, basics);
    const techniquesRoot = element('div', 'loadout-techniques', this.root);
    for (let slot = 0; slot < rules.techniqueSlots; slot++) {
      this.techniqueSelects.push(this.buildTechniqueSelect(techniquesRoot, slot));
    }

    this.errorList = element('ul', 'loadout-errors', this.root);
    this.verdictLine = element('div', 'loadout-verdict', this.root);
    this.verdictLine.setAttribute('aria-live', 'polite');
  }

  mount(root: HTMLElement): void {
    root.appendChild(this.root);
  }

  setBudget(budget: number): void {
    this.budget = budget;
    this.refresh();
  }

  // Un état posé de l'extérieur vaut changement: l'écran doit pouvoir l'envoyer au serveur.
  setState(state: LoadoutState): void {
    this.state = state;
    this.syncControls(state);
    this.refresh();
    this.notify();
  }

  onChange(handler: (loadout: Loadout | null) => void): void {
    this.changeHandler = handler;
  }

  setServerVerdict(valid: boolean, message: string | null): void {
    this.verdictLine.textContent = valid ? '' : (message ?? '');
    this.root.classList.toggle('is-invalid', !valid);
  }

  private buildAttributeRow(parent: HTMLElement, id: AttributeId): AttributeRow {
    const range = this.rules.attributes[id];
    const row = element('label', 'loadout-attribute', parent);
    element('span', 'loadout-attribute-name', row).textContent = capitalize(id);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = '1';
    row.appendChild(input);
    const valueLabel = element('span', 'loadout-attribute-value', row);
    input.addEventListener('input', () => {
      this.onAttributeChanged(id, input, valueLabel);
    });
    return { input, valueLabel };
  }

  private buildBasicSelect(parent: HTMLElement, basics: BasicOption[]): HTMLSelectElement {
    const field = element('label', 'loadout-field', parent);
    field.textContent = 'Basic attack';
    const select = document.createElement('select');
    select.className = 'loadout-basic';
    for (const basic of basics) {
      const entry = document.createElement('option');
      entry.value = basic.id;
      entry.textContent = basic.name;
      select.appendChild(entry);
    }
    field.appendChild(select);
    select.addEventListener('change', () => {
      this.onBasicChanged(select.value);
    });
    return select;
  }

  private buildTechniqueSelect(parent: HTMLElement, slot: number): HTMLSelectElement {
    const field = element('label', 'loadout-field', parent);
    field.textContent = `Technique ${slot + 1}`;
    const select = document.createElement('select');
    select.className = 'loadout-technique';
    for (const option of this.techniques) {
      const entry = document.createElement('option');
      entry.value = option.id;
      const cooldownSeconds = (option.cooldownMs / MS_PER_SECOND).toFixed(1);
      entry.textContent = `${option.name} · ${option.chakraCost} chakra · ${cooldownSeconds}s`;
      select.appendChild(entry);
    }
    field.appendChild(select);
    select.addEventListener('change', () => {
      this.onTechniqueChanged(slot, select.value);
    });
    return select;
  }

  private syncControls(state: LoadoutState): void {
    for (const id of ATTRIBUTE_IDS) {
      const row = this.attributeRows[id];
      if (row === undefined) continue;
      row.input.value = String(state.build[id]);
      row.valueLabel.textContent = String(state.build[id]);
    }
    this.basicSelect.value = state.basicAttackId ?? '';
    for (let slot = 0; slot < this.techniqueSelects.length; slot++) {
      const select = this.techniqueSelects[slot];
      if (select === undefined) continue;
      select.value = state.techniqueIds[slot] ?? '';
    }
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
    this.notify();
  }

  private onBasicChanged(id: string): void {
    if (this.state === null) return;
    this.state = { ...this.state, basicAttackId: id };
    this.refresh();
    this.notify();
  }

  private onTechniqueChanged(slot: number, id: string): void {
    if (this.state === null) return;
    this.state = setTechnique(this.state, slot, id, this.techniques);
    this.syncControls(this.state);
    this.refresh();
    this.notify();
  }

  private notify(): void {
    const state = this.state;
    if (state === null || this.changeHandler === null) return;
    this.changeHandler(toLoadout(state));
  }

  private refresh(): void {
    const state = this.state;
    if (state === null) return;
    this.pointsLabel.textContent = `${pointsLeft(state, this.budget)} of ${this.budget} points left`;
    this.errorList.replaceChildren();
    for (const message of loadoutErrors(state, this.rules, this.budget, this.techniques)) {
      element('li', 'loadout-error', this.errorList).textContent = message;
    }
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
