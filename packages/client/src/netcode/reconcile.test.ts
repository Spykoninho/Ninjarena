import { describe, expect, it } from 'vitest';
import { GameSimulation, neutralInput } from '@ninjarena/core';
import { loadContent, loadMap } from '@ninjarena/content';
import { PredictionBuffer } from './predictionBuffer';
import { reconcile } from './reconcile';

const makeSim = () => {
  const content = loadContent();
  const sim = new GameSimulation({
    map: loadMap(content, 'arena'),
    abilities: content.abilities,
    characters: content.characters,
    matchConfig: { ...content.matchModes.get('duel'), countdownMs: 0 },
  });
  sim.addPlayer({ id: 'me', teamId: 'team-0', characterId: 'ninja' });
  sim.addPlayer({ id: 'other', teamId: 'team-1', characterId: 'ninja' });
  sim.startMatch();
  return sim;
};
const right = () => ({ ...neutralInput(), move: { x: 1, y: 0 } });

describe('reconcile', () => {
  it('reproduces the server state when the server processed the same inputs', () => {
    const server = makeSim();
    const client = makeSim();
    const buffer = new PredictionBuffer();
    for (let seq = 1; seq <= 10; seq++) {
      const input = right();
      buffer.push(seq, input);
      client.step({ me: input });
      if (seq <= 6) server.step({ me: input });
    }
    const snapshot = server.snapshot();
    buffer.acknowledge(6);
    reconcile(client, 'me', snapshot, buffer.pending);
    // Le client a rejoué les ticks 7 à 10 par-dessus le tick 6 du serveur.
    const expected = makeSim();
    for (let i = 0; i < 10; i++) expected.step({ me: right() });
    expect(client.world.players['me']!.position).toEqual(expected.world.players['me']!.position);
  });

  it('corrects a misprediction to the authoritative position', () => {
    const server = makeSim();
    const client = makeSim();
    const buffer = new PredictionBuffer();
    buffer.push(1, right());
    client.step({ me: right() });
    server.step({ me: neutralInput() }); // le serveur n'a vu aucun mouvement
    buffer.acknowledge(1);
    reconcile(client, 'me', server.snapshot(), buffer.pending);
    expect(client.world.players['me']!.position).toEqual(server.world.players['me']!.position);
  });
});
