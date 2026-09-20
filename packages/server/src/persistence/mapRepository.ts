import type { MapDocument } from '@ninjarena/core';

export interface MapRepository {
  list(): Promise<MapDocument[]>;
  get(id: string): Promise<MapDocument | null>;
  save(document: MapDocument): Promise<void>;
  // Vrai si une carte a bien disparu, faux si l'id n'existait pas.
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}

export class InMemoryMapRepository implements MapRepository {
  private readonly maps = new Map<string, MapDocument>();

  list(): Promise<MapDocument[]> {
    return Promise.resolve([...this.maps.values()]);
  }

  get(id: string): Promise<MapDocument | null> {
    return Promise.resolve(this.maps.get(id) ?? null);
  }

  save(document: MapDocument): Promise<void> {
    this.maps.set(document.id, document);
    return Promise.resolve();
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.maps.delete(id));
  }

  count(): Promise<number> {
    return Promise.resolve(this.maps.size);
  }
}
