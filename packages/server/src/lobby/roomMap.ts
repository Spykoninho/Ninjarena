import type { MapDocument, MapIssue, MapSummary, RoomSettings } from '@ninjarena/core';
import { matchFormatOf, spawnIssues } from '@ninjarena/core';
import type { MapLibrary } from '../maps/mapLibrary';

// La carte se lit de façon asynchrone alors que la salle répond tout de suite: elle en garde un cache.
export class RoomMapCache {
  private readonly maps: MapLibrary;
  private readonly settings: () => RoomSettings;
  private cachedDocument: MapDocument | null = null;
  private cachedSummary: MapSummary | null = null;
  private cachedIssues: MapIssue[] = [];

  constructor(maps: MapLibrary, settings: () => RoomSettings) {
    this.maps = maps;
    this.settings = settings;
  }

  get document(): MapDocument | null {
    return this.cachedDocument;
  }

  get summary(): MapSummary | null {
    return this.cachedSummary;
  }

  get issues(): MapIssue[] {
    return this.cachedIssues;
  }

  async load(): Promise<void> {
    const mapId = this.settings().mapId;
    const document = await this.maps.get(mapId);
    // Un chargement lancé avant un changement de carte ne doit pas écraser le cache courant.
    if (this.settings().mapId !== mapId) return;
    this.accept(document);
  }

  accept(document: MapDocument | null): void {
    this.cachedDocument = document;
    this.cachedSummary = document === null ? null : this.maps.summaryOf(document);
    this.refreshIssues();
  }

  refreshIssues(): void {
    const document = this.cachedDocument;
    if (document === null) {
      this.cachedIssues = [];
      return;
    }
    // Un tournoi se joue en duels: la carte n'a besoin d'apparitions que pour deux joueurs.
    this.cachedIssues = [
      ...this.maps.issuesOf(document),
      ...spawnIssues(document, matchFormatOf(this.settings())),
    ];
  }
}
