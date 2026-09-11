export class DefinitionCatalog<T extends { id: string }> {
  private readonly items: readonly T[];
  private readonly byId: Map<string, T>;

  constructor(items: readonly T[]) {
    this.byId = new Map<string, T>();
    for (const item of items) {
      if (this.byId.has(item.id)) throw new Error(`Duplicate definition "${item.id}"`);
      this.byId.set(item.id, item);
    }
    this.items = [...items];
  }

  get(id: string): T {
    const item = this.byId.get(id);
    if (item === undefined) throw new Error(`Unknown definition "${id}"`);
    return item;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly T[] {
    return this.items;
  }
}
