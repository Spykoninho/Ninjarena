import type { MapDocument, MapIssue, MapSummary, RoomSettings } from '@ninjarena/core';
import { isRandomMap, matchFormatOf, spawnIssues } from '@ninjarena/core';
import type { MapLibrary } from '../maps/mapLibrary';

// `missing` couvre aussi le chargement en cours: la salle ne distingue pas l'attente de l'absence.
export type RoomMapStatus = 'missing' | 'invalid' | 'ready';

// La carte se lit de façon asynchrone alors que la salle répond tout de suite: elle en garde un cache.
// En carte aléatoire le cache tient toute la bibliothèque et ne retient que ce qui convient au format.
export class RoomMapCache {
  private readonly maps: MapLibrary;
  private readonly settings: () => RoomSettings;
  private candidates: MapDocument[] | null = null;
  private cachedPlayable: MapDocument[] = [];
  private cachedIssues: MapIssue[] = [];

  constructor(maps: MapLibrary, settings: () => RoomSettings) {
    this.maps = maps;
    this.settings = settings;
  }

  // Le résumé affiché au salon; une carte aléatoire n'en a pas, elle se tire au lancement.
  get summary(): MapSummary | null {
    const fixed = this.random ? null : (this.candidates?.[0] ?? null);
    return fixed === null ? null : this.maps.summaryOf(fixed);
  }

  // Les défauts de la carte choisie; en aléatoire, seules les cartes sans défaut sont retenues.
  get issues(): MapIssue[] {
    return this.cachedIssues;
  }

  // Les cartes dans lesquelles un match peut se tirer, dans l'ordre de la bibliothèque.
  get playable(): readonly MapDocument[] {
    return this.cachedPlayable;
  }

  get status(): RoomMapStatus {
    if (this.candidates === null || this.candidates.length === 0) return 'missing';
    return this.cachedPlayable.length === 0 ? 'invalid' : 'ready';
  }

  async load(): Promise<void> {
    const mapId = this.settings().mapId;
    const loaded = isRandomMap(mapId) ? await this.maps.documents() : await this.loadOne(mapId);
    // Un chargement lancé avant un changement de carte ne doit pas écraser le cache courant.
    if (this.settings().mapId !== mapId) return;
    this.accept(loaded);
  }

  accept(documents: readonly MapDocument[] | MapDocument | null): void {
    this.candidates = documents === null ? [] : [documents].flat();
    this.refreshIssues();
  }

  refreshIssues(): void {
    const candidates = this.candidates ?? [];
    // Un tournoi se joue en duels: la carte n'a besoin d'apparitions que pour deux joueurs.
    const format = matchFormatOf(this.settings());
    const playable: MapDocument[] = [];
    let issues: MapIssue[] = [];
    for (const document of candidates) {
      const found = [...this.maps.issuesOf(document), ...spawnIssues(document, format)];
      if (found.length === 0) playable.push(document);
      else if (!this.random) issues = found;
    }
    this.cachedPlayable = playable;
    this.cachedIssues = issues;
  }

  private get random(): boolean {
    return isRandomMap(this.settings().mapId);
  }

  private async loadOne(mapId: string): Promise<MapDocument[]> {
    const document = await this.maps.get(mapId);
    return document === null ? [] : [document];
  }
}

// Tire une carte par manche parmi celles qui conviennent, sans jouer deux fois de suite la même.
export function drawRoundMaps(
  playable: readonly MapDocument[],
  rounds: number,
  randomInt: (max: number) => number,
): MapDocument[] {
  const drawn: MapDocument[] = [];
  let previous: MapDocument | null = null;
  for (let round = 0; round < rounds; round++) {
    const choices = playable.filter((map) => map !== previous);
    const pick: MapDocument | null | undefined =
      choices.length === 0 ? previous : choices[randomInt(choices.length)];
    if (pick === undefined || pick === null) break;
    drawn.push(pick);
    previous = pick;
  }
  return drawn;
}
