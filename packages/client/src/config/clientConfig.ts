export interface ClientConfig {
  serverUrl: string;
  playerName: string;
  interpolationDelayTicks: number;
  zoom: number;
}

const DEFAULT_SERVER_URL = 'ws://localhost:8080';
const DEFAULT_INTERPOLATION_DELAY_TICKS = 6;
const DEFAULT_ZOOM = 3;
const NAME_SUFFIX_LENGTH = 4;
const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function loadClientConfig(search: string): ClientConfig {
  const params = new URLSearchParams(search);
  return {
    serverUrl: text(params.get('server')) ?? DEFAULT_SERVER_URL,
    playerName: text(params.get('name')) ?? randomName(),
    interpolationDelayTicks: number(params.get('delay'), DEFAULT_INTERPOLATION_DELAY_TICKS),
    zoom: number(params.get('zoom'), DEFAULT_ZOOM),
  };
}

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function number(value: string | null, fallback: number): number {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function randomName(): string {
  let suffix = '';
  for (let i = 0; i < NAME_SUFFIX_LENGTH; i++) {
    suffix += NAME_ALPHABET.charAt(Math.floor(Math.random() * NAME_ALPHABET.length));
  }
  return `ninja-${suffix}`;
}
