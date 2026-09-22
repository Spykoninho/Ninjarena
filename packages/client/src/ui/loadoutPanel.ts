import type {
  AttributeId,
  CharacterBaseStats,
  Loadout,
  StatRulesDefinition,
} from '@ninjarena/core';
import { ATTRIBUTE_IDS, computeStats } from '@ninjarena/core';
import { abilityCard, updateCardNumbers } from './abilityCards';
import type { AbilityCard } from './abilityCards';
import type { DamageMultipliers } from './abilityText';
import { attributeEffects, attributeHints } from './buildText';
import { loadoutErrors, pointsLeft, setAttribute, setTechnique, toLoadout } from './loadoutModel';
import type { AbilityOption, LoadoutState, SlotBindings } from './loadoutModel';

interface AttributeRow {
  input: HTMLInputElement;
  valueLabel: HTMLElement;
  effect: HTMLElement;
}

// Un emplacement du kit: l'attaque de base, l'esquive imposée par le personnage, ou une technique.
type SlotId = { kind: 'basic' } | { kind: 'dash' } | { kind: 'technique'; index: number };

interface Slot {
  id: SlotId;
  root: HTMLElement;
  label: string;
  key: string;
  keyLabel: HTMLElement;
  holder: HTMLElement;
  card: AbilityCard | null;
}

const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  vitality: 'Vitalité',
  strength: 'Force',
  power: 'Puissance',
  speed: 'Vitesse',
  maxChakra: 'Chakra',
  chakraRegen: 'Régénération',
  defense: 'Défense',
};

export class LoadoutPanel {
  private readonly rules: StatRulesDefinition;
  private readonly base: CharacterBaseStats;
  private readonly hints: Record<AttributeId, string>;
  private readonly techniques: AbilityOption[];
  private readonly basics: AbilityOption[];
  private keys: SlotBindings;
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
  private readonly changeHandlers: ((loadout: Loadout | null) => void)[] = [];

  constructor(
    rules: StatRulesDefinition,
    base: CharacterBaseStats,
    techniques: AbilityOption[],
    basics: AbilityOption[],
    dash: AbilityOption | null,
    keys: SlotBindings,
  ) {
    this.rules = rules;
    this.base = base;
    this.hints = attributeHints(rules);
    this.techniques = techniques;
    this.basics = basics;
    this.keys = keys;
    this.budget = rules.defaultPointBudget;
    this.root = document.createElement('div');
    this.root.className = 'loadout';

    const build = element('section', 'loadout-build', this.root);
    const buildHeader = element('div', 'loadout-section-header', build);
    element('h2', 'lobby-section-title', buildHeader).textContent = 'Répartition';
    this.pointsLabel = element('span', 'loadout-points', buildHeader);
    const attributesRoot = element('div', 'loadout-attributes', build);
    for (const id of ATTRIBUTE_IDS) {
      this.attributeRows[id] = this.buildAttributeRow(attributesRoot, id);
    }

    const kit = element('section', 'loadout-kit', this.root);
    const kitHeader = element('div', 'loadout-section-header', kit);
    element('h2', 'lobby-section-title', kitHeader).textContent = 'Attaques';
    element('span', 'loadout-hint', kitHeader).textContent =
      'Choisis un emplacement, puis une technique. Survole une carte pour lire ce qu’elle fait.';
    const slotsRoot = element('div', 'loadout-slots', kit);
    this.slots.push(this.buildSlot(slotsRoot, { kind: 'basic' }, 'Attaque de base', keys.basic));
    const dashSlot = this.buildSlot(slotsRoot, { kind: 'dash' }, 'Esquive', keys.dash);
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
    this.changeHandlers.push(handler);
  }

  setServerVerdict(valid: boolean, message: string | null): void {
    this.verdictLine.textContent = valid ? '' : (message ?? '');
    this.root.classList.toggle('is-invalid', !valid);
  }

  // Les touches changent depuis les réglages: chaque emplacement et chaque carte réaffichent la leur.
  setKeys(keys: SlotBindings): void {
    this.keys = keys;
    for (const slot of this.slots) {
      slot.key = this.keyOf(slot.id);
      slot.keyLabel.textContent = slot.key;
      const option = slot.card?.option ?? null;
      slot.card = null;
      slot.holder.replaceChildren();
      this.fillSlot(slot, option);
    }
    this.syncPicker();
    if (this.state !== null) this.refreshNumbers(this.state);
  }

  private buildAttributeRow(parent: HTMLElement, id: AttributeId): AttributeRow {
    const range = this.rules.attributes[id];
    const row = element('label', 'loadout-attribute', parent);
    const head = element('span', 'loadout-attribute-head', row);
    element('span', 'loadout-attribute-name', head).textContent = ATTRIBUTE_LABELS[id];
    element('span', 'loadout-attribute-hint', head).textContent = this.hints[id];
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = '1';
    row.appendChild(input);
    const valueLabel = element('span', 'loadout-attribute-value', row);
    const effect = element('span', 'loadout-attribute-effect', row);
    input.addEventListener('input', () => {
      this.onAttributeChanged(id, input, valueLabel);
    });
    return { input, valueLabel, effect };
  }

  private buildSlot(parent: HTMLElement, id: SlotId, label: string, key: string): Slot {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = `loadout-slot loadout-slot-${id.kind}`;
    root.disabled = id.kind === 'dash';
    const header = element('span', 'loadout-slot-header', root);
    element('span', 'loadout-slot-label', header).textContent = label;
    const keyLabel = element('span', 'loadout-slot-key', header);
    keyLabel.textContent = key;
    const holder = element('span', 'loadout-slot-holder', root);
    parent.appendChild(root);
    const slot: Slot = { id, root, label, key, keyLabel, holder, card: null };
    if (id.kind !== 'dash') {
      root.addEventListener('click', () => {
        this.selectSlot(id);
      });
    }
    return slot;
  }

  private fillSlot(slot: Slot, option: AbilityOption | null): void {
    if (slot.card?.option.id === option?.id) return;
    slot.holder.replaceChildren();
    slot.card = null;
    if (option === null) {
      element('span', 'loadout-slot-empty', slot.holder).textContent = 'Vide';
      return;
    }
    slot.card = abilityCard(option, slot.holder, slot.key, null);
  }

  private selectSlot(id: SlotId): void {
    this.active = id;
    for (const slot of this.slots) slot.root.classList.toggle('is-active', sameSlot(slot.id, id));
    const basic = id.kind === 'basic';
    this.pickerTitle.textContent = basic ? 'Attaques de base' : 'Techniques';
    this.pickerGrid.replaceChildren();
    this.pickerCards.clear();
    for (const option of basic ? this.basics : this.techniques) {
      const card = abilityCard(option, this.pickerGrid, '', () => {
        this.onPicked(option.id);
      });
      this.pickerCards.set(option.id, card);
    }
    this.syncPicker();
    if (this.state !== null) this.refreshNumbers(this.state);
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
    return this.keyOf(this.active);
  }

  private keyOf(id: SlotId): string {
    if (id.kind === 'technique') return this.keys.techniques[id.index] ?? '';
    return id.kind === 'basic' ? this.keys.basic : this.keys.dash;
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
    if (state === null) return;
    const loadout = toLoadout(state);
    for (const handler of this.changeHandlers) handler(loadout);
  }

  private refresh(): void {
    const state = this.state;
    if (state === null) return;
    this.pointsLabel.textContent = `${pointsLeft(state, this.budget)} point(s) sur ${this.budget} à répartir`;
    this.refreshNumbers(state);
    this.errorList.replaceChildren();
    for (const message of loadoutErrors(state, this.rules, this.budget, this.techniques)) {
      element('li', 'loadout-error', this.errorList).textContent = message;
    }
  }

  // Les chiffres des cartes et des lignes de stats découlent tous de la même répartition.
  private refreshNumbers(state: LoadoutState): void {
    const effects = attributeEffects(state.build, this.base, this.rules);
    for (const id of ATTRIBUTE_IDS) {
      const row = this.attributeRows[id];
      if (row !== undefined) row.effect.textContent = effects[id];
    }
    const stats = computeStats(this.base, state.build, this.rules);
    const multipliers: DamageMultipliers = {
      physical: stats.physicalDamageMultiplier,
      technique: stats.techniqueDamageMultiplier,
    };
    for (const slot of this.slots)
      if (slot.card !== null) updateCardNumbers(slot.card, multipliers);
    for (const card of this.pickerCards.values()) updateCardNumbers(card, multipliers);
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
