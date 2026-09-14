import { ATTRIBUTE_IDS } from '@ninjarena/core';
import type { Build } from '@ninjarena/core';

export interface ClientConfig {
  serverUrl: string;
  playerName: string;
  interpolationDelayTicks: number;
  zoom: number;
  build: Partial<Build>;
  basicAttackId: string | null;
  techniqueIds: string[];
  roomCode: string;
  editor: boolean;
}

const DEFAULT_SERVER_URL = 'ws://localhost:8080';
const DEFAULT_INTERPOLATION_DELAY_TICKS = 6;
const DEFAULT_ZOOM = 3;
const MIN_ZOOM = 1;
const NAME_SUFFIX_LENGTH = 4;
const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export interface Origin {
  protocol: string;
  host: string;
}

// En production le serveur est derrière le même reverse proxy que la page, sous `<base>ws`.
export function sameOriginServerUrl(origin: Origin, base: string): string {
  const scheme = origin.protocol === 'https:' ? 'wss' : 'ws';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${scheme}://${origin.host}${prefix}ws`;
}

export function loadClientConfig(
  search: string,
  defaultServerUrl: string = DEFAULT_SERVER_URL,
): ClientConfig {
  const params = new URLSearchParams(search);
  return {
    serverUrl: text(params.get('server')) ?? defaultServerUrl,
    playerName: text(params.get('name')) ?? randomName(),
    interpolationDelayTicks: number(params.get('delay'), DEFAULT_INTERPOLATION_DELAY_TICKS, 0),
    // Un zoom fractionnaire casse l'alignement au pixel des tuiles.
    zoom: Math.floor(number(params.get('zoom'), DEFAULT_ZOOM, MIN_ZOOM)),
    build: parseBuild(params.get('build')),
    basicAttackId: text(params.get('basic')),
    techniqueIds: parseList(params.get('techniques')),
    roomCode: text(params.get('room'))?.toUpperCase() ?? '',
    // Le drapeau vaut par sa présence: `?editor` seul doit suffire.
    editor: params.has('editor'),
  };
}

function parseBuild(value: string | null): Partial<Build> {
  const raw = text(value);
  if (raw === null) return {};
  const parts = raw.split(',');
  const build: Partial<Build> = {};
  ATTRIBUTE_IDS.forEach((id, index) => {
    const parsed = Number.parseInt(parts[index] ?? '', 10);
    if (Number.isInteger(parsed)) build[id] = parsed;
  });
  return build;
}

function parseList(value: string | null): string[] {
  const raw = text(value);
  if (raw === null) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function number(value: string | null, fallback: number, min: number): number {
  // Un paramètre absent doit retomber sur le défaut: `Number(null)` vaudrait 0.
  const raw = text(value);
  if (raw === null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function randomName(): string {
  let suffix = '';
  for (let i = 0; i < NAME_SUFFIX_LENGTH; i++) {
    suffix += NAME_ALPHABET.charAt(Math.floor(Math.random() * NAME_ALPHABET.length));
  }
  return `ninja-${suffix}`;
}
