import type { MapDocument, MapIssue, MapSummary } from '@ninjarena/core';
import { migrateMapDocument, summarizeMap, validateMapDocument } from '@ninjarena/core';
import type { GameContent } from '@ninjarena/content';
import type { MapRepository } from '../persistence/mapRepository';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_SUFFIX_LENGTH = 4;
const MAX_SLUG_LENGTH = 30;
const MAX_REPORTED_ISSUES = 3;

export type SaveMapResult =
  { ok: true; id: string } | { ok: false; code: 'INVALID_MAP' | 'MAP_STORE_FULL'; message: string };

export type DeleteMapResult =
  { ok: true } | { ok: false; code: 'MAP_READONLY' | 'MAP_NOT_FOUND'; message: string };

export interface MapLibraryOptions {
  content: GameContent;
  repository: MapRepository;
  maxStoredMaps: number;
  random?: () => number;
  now?: () => Date;
}

export class MapLibrary {
  private readonly content: GameContent;
  private readonly repository: MapRepository;
  private readonly maxStoredMaps: number;
  private readonly random: () => number;
  private readonly now: () => Date;

  constructor(options: MapLibraryOptions) {
    this.content = options.content;
    this.repository = options.repository;
    this.maxStoredMaps = options.maxStoredMaps;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  async list(): Promise<MapSummary[]> {
    const builtin = this.content.maps.all().map((doc) => summarizeMap(doc, true));
    const stored = (await this.repository.list()).map((doc) => summarizeMap(doc, false));
    return [...sortByName(builtin), ...sortByName(stored)];
  }

  // Toutes les cartes jouables, intégrées d'abord: le tirage d'une salle en carte aléatoire.
  async documents(): Promise<MapDocument[]> {
    return [...this.content.maps.all(), ...(await this.repository.list())];
  }

  async get(id: string): Promise<MapDocument | null> {
    if (this.content.maps.has(id)) return this.content.maps.get(id);
    return this.repository.get(id);
  }

  // Seule la bibliothèque sait d'où vient une carte: le résumé se demande ici.
  summaryOf(document: MapDocument): MapSummary {
    return summarizeMap(document, this.content.maps.has(document.id));
  }

  issuesOf(document: MapDocument): MapIssue[] {
    const tileset = this.content.tilesets.get(document.tileset);
    return validateMapDocument(document, tileset);
  }

  async save(raw: unknown, author: string): Promise<SaveMapResult> {
    let document: MapDocument;
    try {
      document = migrateMapDocument(raw);
    } catch (error) {
      return invalidMap(error instanceof Error ? error.message : String(error));
    }

    if (!this.content.tilesets.has(document.tileset)) {
      return invalidMap(`unknown tileset "${document.tileset}"`);
    }

    const issues = this.issuesOf(document);
    if (issues.length > 0) {
      return invalidMap(
        issues
          .slice(0, MAX_REPORTED_ISSUES)
          .map((issue) => issue.message)
          .join('; '),
      );
    }

    // Une carte intégrée est en lecture seule: renvoyée telle quelle elle se joue directement,
    // modifiée elle devient une copie sous un id neuf.
    const builtin = this.content.maps.has(document.id);
    if (builtin && sameMap(document, this.content.maps.get(document.id))) {
      return { ok: true, id: document.id };
    }

    // Un id inconnu du dépôt désigne une nouvelle carte: le sien n'est qu'une suggestion.
    const existing = builtin ? null : await this.repository.get(document.id);
    const isNew = existing === null;
    const id = isNew ? await this.generateId(document.name) : document.id;

    if (isNew && (await this.repository.count()) >= this.maxStoredMaps) {
      return { ok: false, code: 'MAP_STORE_FULL', message: 'the map store is full' };
    }

    // Un écrasement garde sa date d'origine: seule une carte neuve reçoit l'horodatage du jour.
    const stamped: MapDocument = {
      ...document,
      id,
      author,
      createdAt: existing?.createdAt ?? this.now().toISOString(),
    };
    await this.repository.save(stamped);
    return { ok: true, id };
  }

  async delete(id: string): Promise<DeleteMapResult> {
    if (this.content.maps.has(id)) {
      return { ok: false, code: 'MAP_READONLY', message: `"${id}" is a built-in map` };
    }
    if (!(await this.repository.delete(id))) {
      return { ok: false, code: 'MAP_NOT_FOUND', message: `no map "${id}"` };
    }
    return { ok: true };
  }

  private async generateId(name: string): Promise<string> {
    const slug = slugify(name);
    let id: string;
    do {
      id = `${slug}-${this.randomSuffix()}`;
    } while (this.content.maps.has(id) || (await this.repository.get(id)) !== null);
    return id;
  }

  private randomSuffix(): string {
    let suffix = '';
    for (let i = 0; i < ID_SUFFIX_LENGTH; i++) {
      suffix += ID_ALPHABET[Math.floor(this.random() * ID_ALPHABET.length)];
    }
    return suffix;
  }
}

// Auteur et date ne font pas la carte: seul le contenu jouable compte.
function sameMap(a: MapDocument, b: MapDocument): boolean {
  return JSON.stringify(withoutStamps(a)) === JSON.stringify(withoutStamps(b));
}

function withoutStamps(document: MapDocument): MapDocument {
  return { ...document, author: undefined, createdAt: undefined };
}

function invalidMap(message: string): SaveMapResult {
  return { ok: false, code: 'INVALID_MAP', message };
}

function sortByName(summaries: MapSummary[]): MapSummary[] {
  return [...summaries].sort((a, b) => a.name.localeCompare(b.name));
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
  return slug === '' ? 'map' : slug;
}
