import { migrateMapDocument } from '@ninjarena/core';
import type { MapDocument } from '@ninjarena/core';

const INDENT = 2;

export function serializeMap(document: MapDocument): string {
  return JSON.stringify(document, null, INDENT);
}

// Une erreur de `JSON.parse` ou de schéma ne dit pas de quel fichier elle parle: le préfixe le dit.
export function parseMapFile(text: string): MapDocument {
  try {
    return migrateMapDocument(JSON.parse(text));
  } catch (error) {
    throw new Error(`fichier de carte invalide : ${reasonOf(error)}`);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
