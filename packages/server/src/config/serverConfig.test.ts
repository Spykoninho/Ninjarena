import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './serverConfig';

describe('loadServerConfig', () => {
  it('falls back to the development defaults', () => {
    expect(loadServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 8080,
      tickRate: 60,
      snapshotRate: 30,
      inputQueueCapacity: 8,
      maxConnections: 32,
      maxRooms: 64,
      postMatchMs: 8000,
      mapsDir: 'data/maps',
      maxStoredMaps: 100,
      accountsFile: 'data/accounts.json',
    });
  });

  it('coerces environment strings', () => {
    expect(
      loadServerConfig({
        NINJARENA_HOST: '0.0.0.0',
        NINJARENA_PORT: '9000',
        NINJARENA_TICK_RATE: '30',
        NINJARENA_MAX_ROOMS: '10',
        NINJARENA_POST_MATCH_MS: '0',
        NINJARENA_MAPS_DIR: '/tmp/maps',
        NINJARENA_MAX_STORED_MAPS: '5',
        NINJARENA_ACCOUNTS_FILE: '/tmp/accounts.json',
      }),
    ).toMatchObject({
      host: '0.0.0.0',
      port: 9000,
      tickRate: 30,
      maxRooms: 10,
      postMatchMs: 0,
      mapsDir: '/tmp/maps',
      maxStoredMaps: 5,
      accountsFile: '/tmp/accounts.json',
    });
  });

  it('fails fast on an invalid value, naming it on a single line', () => {
    expect(() => loadServerConfig({ NINJARENA_PORT: 'not-a-port' })).toThrow(
      /invalid configuration/,
    );
    expect(() => loadServerConfig({ NINJARENA_MAX_CONNECTIONS: '0' })).toThrow(
      /^invalid configuration: maxConnections [^\n]+$/,
    );
    expect(() => loadServerConfig({ NINJARENA_MAX_ROOMS: '0' })).toThrow(
      /^invalid configuration: maxRooms [^\n]+$/,
    );
    expect(() => loadServerConfig({ NINJARENA_MAX_ROOMS: '1025' })).toThrow(
      /^invalid configuration: maxRooms [^\n]+$/,
    );
    expect(() => loadServerConfig({ NINJARENA_POST_MATCH_MS: '-1' })).toThrow(
      /^invalid configuration: postMatchMs [^\n]+$/,
    );
    expect(() => loadServerConfig({ NINJARENA_POST_MATCH_MS: '600001' })).toThrow(
      /^invalid configuration: postMatchMs [^\n]+$/,
    );
    expect(() => loadServerConfig({ NINJARENA_MAX_STORED_MAPS: '-1' })).toThrow(
      /^invalid configuration: maxStoredMaps [^\n]+$/,
    );
    expect(() => loadServerConfig({ NINJARENA_MAX_STORED_MAPS: '10001' })).toThrow(
      /^invalid configuration: maxStoredMaps [^\n]+$/,
    );
  });
});
