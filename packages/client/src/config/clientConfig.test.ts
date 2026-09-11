import { describe, expect, it } from 'vitest';
import { loadClientConfig } from './clientConfig';

describe('loadClientConfig', () => {
  it('falls back to its defaults when the query string is empty', () => {
    const config = loadClientConfig('');
    expect(config.serverUrl).toBe('ws://localhost:8080');
    expect(config.interpolationDelayTicks).toBe(6);
    expect(config.zoom).toBe(3);
    expect(config.playerName).toMatch(/^ninja-[a-z0-9]{4}$/);
  });

  it('keeps the server and the name given in the query string', () => {
    const config = loadClientConfig('?server=ws://arena.example:9000&name=kage');
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
});
