import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MapDocument } from '@ninjarena/core';
import { migrateMapDocument } from '@ninjarena/core';
import type { MapRepository } from './mapRepository';

export interface FileMapRepositoryOptions {
  dir: string;
  log?: (line: string) => void;
}

export class FileMapRepository implements MapRepository {
  private readonly dir: string;
  private readonly log: (line: string) => void;

  constructor(options: FileMapRepositoryOptions) {
    this.dir = options.dir;
    this.log = options.log ?? (() => {});
  }

  async list(): Promise<MapDocument[]> {
    const files = await this.jsonFiles();
    const docs: MapDocument[] = [];
    for (const file of files) {
      const doc = await this.readDocument(file);
      if (doc !== null) docs.push(doc);
    }
    return docs;
  }

  async get(id: string): Promise<MapDocument | null> {
    return this.readDocument(`${id}.json`);
  }

  async save(document: MapDocument): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const target = join(this.dir, `${document.id}.json`);
    const temp = `${target}.tmp`;
    await writeFile(temp, JSON.stringify(document, null, 2), 'utf8');
    await rename(temp, target);
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(join(this.dir, `${id}.json`));
      return true;
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async count(): Promise<number> {
    const files = await this.jsonFiles();
    let count = 0;
    for (const file of files) {
      if ((await this.readDocument(file)) !== null) count++;
    }
    return count;
  }

  private async jsonFiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.dir);
      return entries.filter((entry) => entry.endsWith('.json'));
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  // Un fichier illisible ou invalide ne doit pas bloquer les autres cartes.
  private async readDocument(fileName: string): Promise<MapDocument | null> {
    try {
      const raw = await readFile(join(this.dir, fileName), 'utf8');
      // Un fichier sur disque n'est pas plus digne de confiance qu'un envoi client: même passage obligé.
      return migrateMapDocument(JSON.parse(raw));
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return null;
      const reason = error instanceof Error ? error.message : String(error);
      this.log(`skipping map file ${fileName}: ${reason}`);
      return null;
    }
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
