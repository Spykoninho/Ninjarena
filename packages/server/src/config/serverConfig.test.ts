import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './serverConfig';

describe('loadServerConfig', () => {
  it('falls back to the development defaults', () => {
    expect(loadServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 8080,
      tickRate: 60,
      snapshotRate: 30,
      mapId: 'arena',
      matchModeId: 'duel',
      inputQueueCapacity: 8,
      maxConnections: 32,
      autoStartWhenFull: true,
    });
  });

  it('coerces environment strings and keeps an explicit "false" falsy', () => {
    expect(
      loadServerConfig({
        NINJARENA_HOST: '0.0.0.0',
        NINJARENA_PORT: '9000',
        NINJARENA_TICK_RATE: '30',
        NINJARENA_AUTO_START: 'false',
      }),
    ).toMatchObject({
      host: '0.0.0.0',
      port: 9000,
      tickRate: 30,
      autoStartWhenFull: false,
    });
  });

  it('fails fast on an invalid value, naming it on a single line', () => {
    expect(() => loadServerConfig({ NINJARENA_PORT: 'not-a-port' })).toThrow(
      /invalid configuration/,
    );
    expect(() => loadServerConfig({ NINJARENA_MAX_CONNECTIONS: '0' })).toThrow(
      /^invalid configuration: maxConnections [^\n]+$/,
    );
  });
});
