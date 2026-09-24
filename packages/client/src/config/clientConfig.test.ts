import { describe, expect, it } from 'vitest';
import { loadClientConfig, sameOriginServerUrl } from './clientConfig';

describe('loadClientConfig', () => {
  it('falls back to its defaults when the query string is empty', () => {
    const config = loadClientConfig('');
    expect(config.serverUrl).toBe('ws://localhost:8080');
    expect(loadClientConfig('', 'wss://arena.example/ws').serverUrl).toBe('wss://arena.example/ws');
    expect(config.interpolationDelayTicks).toBe(6);
    expect(config.zoom).toBe(3);
    expect(config.playerName).toMatch(/^ninja-[a-z0-9]{4}$/);
  });

  it('keeps the server and the name given in the query string', () => {
    const config = loadClientConfig('?server=ws://arena.example:9000&name=kage', 'wss://other/ws');
    expect(config.serverUrl).toBe('ws://arena.example:9000');
    expect(config.playerName).toBe('kage');
  });

  it('accepts a zero interpolation delay but refuses an unreadable one', () => {
    expect(loadClientConfig('?delay=0').interpolationDelayTicks).toBe(0);
    expect(loadClientConfig('?delay=abc').interpolationDelayTicks).toBe(6);
    expect(loadClientConfig('?delay=').interpolationDelayTicks).toBe(6);
    expect(loadClientConfig('?delay=-2').interpolationDelayTicks).toBe(6);
  });

  it('keeps the zoom an integer of at least one', () => {
    expect(loadClientConfig('?zoom=2.5').zoom).toBe(2);
    expect(loadClientConfig('?zoom=0.5').zoom).toBe(3);
    expect(loadClientConfig('?zoom=4').zoom).toBe(4);
  });

  it('defaults to an empty build and an empty technique list', () => {
    const config = loadClientConfig('');
    expect(config.build).toEqual({});
    expect(config.techniqueIds).toEqual([]);
  });

  it('parses the build query as a partial build in attribute order', () => {
    const config = loadClientConfig('?build=9,1,2,3,4,5,6');
    expect(config.build).toEqual({
      vitality: 9,
      strength: 1,
      power: 2,
      speed: 3,
      maxChakra: 4,
      chakraRegen: 5,
      defense: 6,
    });
  });

  it('ignores unreadable build entries', () => {
    expect(loadClientConfig('?build=1,x,2').build).toEqual({ vitality: 1, power: 2 });
  });

  it('parses the techniques query as a list of ability ids', () => {
    const config = loadClientConfig('?techniques=blink,fireball,earth-wall');
    expect(config.techniqueIds).toEqual(['blink', 'fireball', 'earth-wall']);
  });

  it('reads the room code from the query in upper case', () => {
    expect(loadClientConfig('?room=ab7k2p').roomCode).toBe('AB7K2P');
    expect(loadClientConfig('').roomCode).toBe('');
  });

  it('opens the editor when the query carries the flag', () => {
    expect(loadClientConfig('?editor').editor).toBe(true);
    expect(loadClientConfig('?editor=1').editor).toBe(true);
    expect(loadClientConfig('').editor).toBe(false);
  });

  it('leaves the touch controls to the device unless the query forces them', () => {
    expect(loadClientConfig('').touch).toBeNull();
    expect(loadClientConfig('?touch').touch).toBe(true);
    expect(loadClientConfig('?touch=1').touch).toBe(true);
    expect(loadClientConfig('?touch=0').touch).toBe(false);
  });

  it('reads the requested basic attack', () => {
    expect(loadClientConfig('?basic=shuriken-throw').basicAttackId).toBe('shuriken-throw');
    expect(loadClientConfig('').basicAttackId).toBeNull();
  });
});

describe('sameOriginServerUrl', () => {
  it('speaks plain ws to a plain http origin', () => {
    expect(sameOriginServerUrl({ protocol: 'http:', host: 'localhost:5173' }, '/')).toBe(
      'ws://localhost:5173/ws',
    );
  });

  it('speaks wss under the base path of an https origin', () => {
    expect(
      sameOriginServerUrl({ protocol: 'https:', host: 'mathisfremiot.fr' }, '/ninjarena/'),
    ).toBe('wss://mathisfremiot.fr/ninjarena/ws');
  });

  it('tolerates a base path without its trailing slash', () => {
    expect(sameOriginServerUrl({ protocol: 'https:', host: 'a.b' }, '/ninjarena')).toBe(
      'wss://a.b/ninjarena/ws',
    );
  });
});
