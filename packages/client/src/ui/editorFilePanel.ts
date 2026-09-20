import { MAP_MAX_SIZE, MAP_MIN_SIZE } from '@ninjarena/core';
import type { MapSummary } from '@ninjarena/core';
import { Popover, button, element, field } from './editorToolbar';

export interface FilePanelActions {
  createMap(width: number, height: number): void;
  openMap(id: string): void;
  deleteMap(id: string, name: string): void;
  importFile(file: File): void;
  exportFile(): void;
}

// Le panneau regroupe tout ce qui remplace la carte en cours: créer, ouvrir, importer, exporter.
export class EditorFilePanel {
  private readonly popover: Popover;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;
  private readonly mapSelect: HTMLSelectElement;
  private readonly openButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly importInput: HTMLInputElement;
  private maps: MapSummary[] = [];

  constructor(
    parent: HTMLElement,
    anchor: HTMLElement,
    actions: FilePanelActions,
    size: { width: number; height: number },
  ) {
    this.popover = new Popover(parent, anchor, 'editor-file');
    const root = this.popover.root;

    const create = section(root, 'Nouvelle carte');
    const sizeRow = element('div', 'editor-row', create);
    this.widthInput = sizeField(sizeRow, 'Largeur', size.width);
    this.heightInput = sizeField(sizeRow, 'Hauteur', size.height);
    button('Créer', 'editor-button', sizeRow, () => {
      actions.createMap(this.size(this.widthInput), this.size(this.heightInput));
      this.popover.setOpen(false);
    });

    const open = section(root, 'Cartes enregistrées');
    const openRow = element('div', 'editor-row', open);
    this.mapSelect = document.createElement('select');
    this.mapSelect.className = 'editor-select';
    openRow.appendChild(this.mapSelect);
    this.openButton = button('Ouvrir', 'editor-button', openRow, () => {
      actions.openMap(this.mapSelect.value);
      this.popover.setOpen(false);
    });
    // Seule une carte enregistrée par un joueur se supprime: une carte intégrée grise le bouton.
    this.deleteButton = button('Supprimer', 'editor-button editor-danger', openRow, () => {
      const selected = this.selectedMap();
      if (selected === undefined) return;
      actions.deleteMap(selected.id, selected.name);
      this.popover.setOpen(false);
    });
    this.deleteButton.title = 'Supprimer la carte sélectionnée du serveur';
    this.mapSelect.addEventListener('change', () => {
      this.refreshDeleteButton();
    });
    this.setMaps([]);

    const files = section(root, 'Fichier JSON');
    const fileRow = element('div', 'editor-row', files);
    this.importInput = document.createElement('input');
    this.importInput.type = 'file';
    this.importInput.accept = 'application/json,.json';
    this.importInput.hidden = true;
    fileRow.appendChild(this.importInput);
    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];
      this.importInput.value = '';
      if (file === undefined) return;
      actions.importFile(file);
      this.popover.setOpen(false);
    });
    button('Importer…', 'editor-button', fileRow, () => {
      this.importInput.click();
    });
    button('Exporter', 'editor-button', fileRow, () => {
      actions.exportFile();
      this.popover.setOpen(false);
    });
  }

  get open(): boolean {
    return this.popover.open;
  }

  setOpen(open: boolean): void {
    this.popover.setOpen(open);
  }

  toggle(): void {
    this.popover.toggle();
  }

  setSize(width: number, height: number): void {
    this.widthInput.value = String(width);
    this.heightInput.value = String(height);
  }

  setMaps(maps: MapSummary[]): void {
    this.maps = maps;
    const selected = this.mapSelect.value;
    this.mapSelect.replaceChildren();
    for (const map of maps) {
      const option = document.createElement('option');
      option.value = map.id;
      const size = `${String(map.width)}×${String(map.height)}`;
      option.textContent = map.builtin
        ? `${map.name} (${size}, intégrée)`
        : `${map.name} (${size})`;
      this.mapSelect.appendChild(option);
    }
    if (maps.some((map) => map.id === selected)) this.mapSelect.value = selected;
    const empty = maps.length === 0;
    if (empty) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Aucune carte enregistrée';
      this.mapSelect.appendChild(option);
    }
    this.mapSelect.disabled = empty;
    this.openButton.disabled = empty;
    this.refreshDeleteButton();
  }

  private selectedMap(): MapSummary | undefined {
    return this.maps.find((map) => map.id === this.mapSelect.value);
  }

  private refreshDeleteButton(): void {
    const selected = this.selectedMap();
    this.deleteButton.disabled = selected === undefined || selected.builtin;
  }

  private size(input: HTMLInputElement): number {
    const parsed = Number.parseInt(input.value, 10);
    return Number.isInteger(parsed) ? parsed : MAP_MIN_SIZE;
  }
}

function section(parent: HTMLElement, title: string): HTMLElement {
  const node = element('section', 'editor-section', parent);
  element('h2', 'editor-section-title', node).textContent = title;
  return node;
}

function sizeField(parent: HTMLElement, label: string, value: number): HTMLInputElement {
  const input = field(parent, label, 'number', 'editor-input editor-size');
  input.min = String(MAP_MIN_SIZE);
  input.max = String(MAP_MAX_SIZE);
  input.value = String(value);
  return input;
}
