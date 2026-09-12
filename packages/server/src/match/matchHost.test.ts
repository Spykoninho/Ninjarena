import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_TIMING,
  GameSimulation,
  abilityMask,
  defaultRoomSettings,
  neutralInput,
  toMatchConfig,
} from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { serverMessageCodec } from '@ninjarena/protocol';
import { ClientSession } from '../session/clientSession';
import { MatchHost } from './matchHost';
import { FakeConnection } from '../testing/fakeConnection';

const TECHNIQUE_IDS = ['blink', 'chakra-shield', 'lightning-dash'];

const setup = () => {
  const content = loadContent();
  const simulation = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: toMatchConfig(
      defaultRoomSettings(content.statRules, 'arena'),
      DEFAULT_MATCH_TIMING,
    ),
    rules: content.statRules,
  });
  const connection = new FakeConnection('c1');
  const session = new ClientSession(connection, 8);
  session.playerId = 'c1';
  simulation.addPlayer({
    id: 'c1',
    teamId: 'team-0',
    characterId: 'ninja',
    techniqueIds: TECHNIQUE_IDS,
  });
  simulation.startMatch();
  const host = new MatchHost({ simulation, sessions: () => [session], snapshotEveryTicks: 2 });
  return { simulation, connection, session, host };
};

describe('MatchHost', () => {
  it('applies one queued input per tick and acknowledges it in the next snapshot', () => {
    const { connection, session, host, simulation } = setup();
    session.inputs.push(7, { ...neutralInput(), move: { x: 1, y: 0 } });
    host.tick();
    host.tick();
    const snapshots = connection.sent
      .map((raw) => serverMessageCodec.decode(raw))
      .filter((m) => m?.type === 'snapshot');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      type: 'snapshot',
      tick: simulation.world.tick,
      lastProcessedSeq: 7,
    });
  });

  it('sends snapshots only every snapshotEveryTicks ticks', () => {
    const { connection, host } = setup();
    for (let i = 0; i < 6; i++) host.tick();
    expect(connection.sent.filter((raw) => raw.includes('"snapshot"'))).toHaveLength(3);
  });

  it('never trusts damage from clients: an input can only carry intent', () => {
    const { host, session, simulation } = setup();
    simulation.addPlayer({
      id: 'c2',
      teamId: 'team-1',
      characterId: 'ninja',
      techniqueIds: TECHNIQUE_IDS,
    });
    session.inputs.push(1, { ...neutralInput(), abilityHeld: abilityMask([0]) });
    host.tick();
    expect(simulation.world.players['c2']!.health).toBe(100);
  });
});
