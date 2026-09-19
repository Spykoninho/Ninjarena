import type { AttributeId, Loadout, StatRulesDefinition } from '@ninjarena/core';
import { ATTRIBUTE_IDS } from '@ninjarena/core';
import { abilityCard } from './abilityCards';
import type { AbilityCard } from './abilityCards';
import { loadoutErrors, pointsLeft, setAttribute, setTechnique, toLoadout } from './loadoutModel';
import type { AbilityOption, LoadoutState, SlotBindings } from './loadoutModel';

interface AttributeRow {
  input: HTMLInputElement;
  valueLabel: HTMLElement;
}

// Un emplacement du kit: l'attaque de base, l'esquive imposée par le personnage, ou une technique.
type SlotId = { kind: 'basic' } | { kind: 'dash' } | { kind: 'technique'; index: number };

interface Slot {
  id: SlotId;
  root: HTMLElement;
  label: string;
  key: string;
  holder: HTMLElement;
  card: AbilityCard | null;
}

const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  vitality: 'Vitality',
  strength: 'Strength',
  power: 'Power',
  speed: 'Speed',
  maxChakra: 'Chakra',
  chakraRegen: 'Chakra regen',
  defense: 'Defense',
};

const ATTRIBUTE_HINTS: Record<AttributeId, string> = {
  vitality: 'More health',
  strength: 'Stronger basic attacks',
  power: 'Stronger techniques',
  speed: 'Faster movement',
  maxChakra: 'Bigger chakra pool',
  chakraRegen: 'Faster chakra regen',
  defense: 'Less damage taken',
};

export class LoadoutPanel {
  private readonly rules: StatRulesDefinition;
  private readonly techniques: AbilityOption[];
  private readonly basics: AbilityOption[];
  private readonly keys: SlotBindings;
  private readonly root: HTMLElement;
  private readonly pointsLabel: HTMLElement;
  private readonly attributeRows: Partial<Record<AttributeId, AttributeRow>> = {};
  private readonly slots: Slot[] = [];
  private readonly pickerTitle: HTMLElement;
  private readonly pickerGrid: HTMLElement;
  private readonly pickerCards = new Map<string, AbilityCard>();
  private readonly errorList: HTMLElement;
  private readonly verdictLine: HTMLElement;
  private budget: number;
  private state: LoadoutState | null = null;
  private active: SlotId = { kind: 'technique', index: 0 };
  private changeHandler: ((loadout: Loadout | null) => void) | null = null;

  constructor(
    rules: StatRulesDefinition,
    techniques: AbilityOption[],
    basics: AbilityOption[],
    dash: AbilityOption | null,
    keys: SlotBindings,
  ) {
    this.rules = rules;
    this.techniques = techniques;
    this.basics = basics;
    this.keys = keys;
    this.budget = rules.defaultPointBudget;
    this.root = document.createElement('div');
    this.root.className = 'loadout';

    const build = element('section', 'loadout-build', this.root);
    const buildHeader = element('div', 'loadout-section-header', build);
    element('h2', 'lobby-section-title', buildHeader).textContent = 'Build';
    this.pointsLabel = element('span', 'loadout-points', buildHeader);
    const attributesRoot = element('div', 'loadout-attributes', build);
    for (const id of ATTRIBUTE_IDS) {
      this.attributeRows[id] = this.buildAttributeRow(attributesRoot, id);
    }

    const kit = element('section', 'loadout-kit', this.root);
    const kitHeader = element('div', 'loadout-section-header', kit);
    element('h2', 'lobby-section-title', kitHeader).textContent = 'Attacks';
    element('span', 'loadout-hint', kitHeader).textContent =
      'Pick a slot, then a technique. Hover a card to read what it does.';
    const slotsRoot = element('div', 'loadout-slots', kit);
    this.slots.push(this.buildSlot(slotsRoot, { kind: 'basic' }, 'Basic attack', keys.basic));
    const dashSlot = this.buildSlot(slotsRoot, { kind: 'dash' }, 'Dash', keys.dash);
    this.slots.push(dashSlot);
    if (dash !== null) this.fillSlot(dashSlot, dash);
    for (let index = 0; index < rules.techniqueSlots; index++) {
      const key = keys.techniques[index] ?? '';
      const id: SlotId = { kind: 'technique', index };
      this.slots.push(this.buildSlot(slotsRoot, id, `Technique ${index + 1}`, key));
    }

    const picker = element('div', 'loadout-picker', kit);
    this.pickerTitle = element('h3', 'loadout-picker-title', picker);
    this.pickerGrid = element('div', 'loadout-picker-grid', picker);

    this.errorList = element('ul', 'loadout-errors', kit);
    this.verdictLine = element('div', 'loadout-verdict', kit);
    this.verdictLine.setAttribute('aria-live', 'polite');
    this.selectSlot(this.active);
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
    row.title = ATTRIBUTE_HINTS[id];
    element('span', 'loadout-attribute-name', row).textContent = ATTRIBUTE_LABELS[id];
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

  private buildSlot(parent: HTMLElement, id: SlotId, label: string, key: string): Slot {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = `loadout-slot loadout-slot-${id.kind}`;
    root.disabled = id.kind === 'dash';
    const header = element('span', 'loadout-slot-header', root);
    element('span', 'loadout-slot-label', header).textContent = label;
    element('span', 'loadout-slot-key', header).textContent = key;
    const holder = element('span', 'loadout-slot-holder', root);
    parent.appendChild(root);
    const slot: Slot = { id, root, label, key, holder, card: null };
    if (id.kind !== 'dash') {
      root.addEventListener('click', () => {
        this.selectSlot(id);
      });
    }
    return slot;
  }

  private fillSlot(slot: Slot, option: AbilityOption | null): void {
    if (slot.card?.root.dataset.id === option?.id) return;
    slot.holder.replaceChildren();
    slot.card = null;
    if (option === null) {
      element('span', 'loadout-slot-empty', slot.holder).textContent = 'Empty';
      return;
    }
    slot.card = abilityCard(option, slot.holder, slot.key, null);
  }

  private selectSlot(id: SlotId): void {
    this.active = id;
    for (const slot of this.slots) slot.root.classList.toggle('is-active', sameSlot(slot.id, id));
    const basic = id.kind === 'basic';
    this.pickerTitle.textContent = basic ? 'Basic attacks' : 'Techniques';
    this.pickerGrid.replaceChildren();
    this.pickerCards.clear();
    for (const option of basic ? this.basics : this.techniques) {
      const card = abilityCard(option, this.pickerGrid, '', () => {
        this.onPicked(option.id);
      });
      this.pickerCards.set(option.id, card);
    }
    this.syncPicker();
  }

  private onPicked(id: string): void {
    if (this.state === null) return;
    if (this.active.kind === 'basic') {
      this.state = { ...this.state, basicAttackId: id };
    } else if (this.active.kind === 'technique') {
      this.state = setTechnique(this.state, this.active.index, id, this.techniques);
      this.selectSlot(nextSlot(this.active, this.rules.techniqueSlots));
    }
    this.syncControls(this.state);
    this.refresh();
    this.notify();
  }

  private syncControls(state: LoadoutState): void {
    for (const id of ATTRIBUTE_IDS) {
      const row = this.attributeRows[id];
      if (row === undefined) continue;
      row.input.value = String(state.build[id]);
      row.valueLabel.textContent = String(state.build[id]);
    }
    for (const slot of this.slots) {
      if (slot.id.kind === 'basic') {
        this.fillSlot(slot, this.basics.find((b) => b.id === state.basicAttackId) ?? null);
      } else if (slot.id.kind === 'technique') {
        const picked = state.techniqueIds[slot.id.index] ?? null;
        this.fillSlot(slot, this.techniques.find((t) => t.id === picked) ?? null);
      }
    }
    this.syncPicker();
  }

  // Une carte choisie porte son emplacement et sa touche; les autres, la touche qu'elles prendraient.
  private syncPicker(): void {
    const state = this.state;
    const activeKey = this.activeKey();
    for (const [id, card] of this.pickerCards) {
      const index = state === null ? -1 : state.techniqueIds.indexOf(id);
      const pickedBasic = state !== null && state.basicAttackId === id;
      const picked = this.active.kind === 'basic' ? pickedBasic : index !== -1;
      card.root.classList.toggle('is-picked', picked);
      const label = this.active.kind === 'basic' ? '' : String(index + 1);
      card.slot.textContent = label;
      card.slot.hidden = !picked || label.length === 0;
      const key = picked ? (this.keys.techniques[index] ?? this.keys.basic) : activeKey;
      card.key.textContent = picked ? key : '';
      card.key.hidden = !picked;
      card.tipKey.textContent = key;
      card.tipKey.hidden = key.length === 0;
    }
  }

  private activeKey(): string {
    if (this.active.kind === 'technique') return this.keys.techniques[this.active.index] ?? '';
    return this.active.kind === 'basic' ? this.keys.basic : this.keys.dash;
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

function sameSlot(a: SlotId, b: SlotId): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'technique' || b.kind !== 'technique' || a.index === b.index;
}

// Après un choix, la sélection passe à la technique suivante: trois clics remplissent le kit.
function nextSlot(current: SlotId, techniqueSlots: number): SlotId {
  if (current.kind !== 'technique') return current;
  return { kind: 'technique', index: (current.index + 1) % techniqueSlots };
}

function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}
