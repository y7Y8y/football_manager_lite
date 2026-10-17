/**
 * Tests de la sauvegarde — la doc 26 nomme « sauvegarde cassée » comme risque
 * et prescrit de versionner tôt. Ces tests vérifient le refus net plutôt que
 * la récupération silencieuse.
 */

import { describe, expect, it } from 'vitest';
import { runTick } from '../core/tick';
import { generateWorld } from './generate';
import {
  SAVE_FORMAT,
  SaveFormatError,
  SaveVersionError,
  canonicalize,
  loadWorld,
  saveWorld,
} from './save';
import { SCHEMA_VERSION, type World } from './types';

const SEED = 20261017;

function world(): World {
  return generateWorld({ seed: SEED, clubCount: 16 });
}

describe('aller-retour', () => {
  it('recharge un monde identique à celui sauvegardé', () => {
    const w = world();
    const reloaded = loadWorld(saveWorld(w));
    expect(canonicalize(reloaded)).toBe(canonicalize(w));
  });

  it('conserve les identifiants et les montants', () => {
    const w = world();
    const reloaded = loadWorld(saveWorld(w));
    expect(reloaded.players.map(p => p.id)).toEqual(w.players.map(p => p.id));
    expect(reloaded.players.map(p => p.value)).toEqual(w.players.map(p => p.value));
    expect(reloaded.fixtures).toHaveLength(w.fixtures.length);
  });

  it('survit à 120 ticks puis au rechargement', () => {
    const w = world();
    for (let i = 0; i < 120; i++) runTick(w);
    const reloaded = loadWorld(saveWorld(w));
    expect(reloaded.tick).toBe(120);
    expect(canonicalize(reloaded)).toBe(canonicalize(w));
  });
});

describe('refus net', () => {
  it('refuse un JSON invalide', () => {
    expect(() => loadWorld('{pas du json')).toThrow(SaveFormatError);
  });

  it('refuse un objet qui n’est pas une enveloppe', () => {
    expect(() => loadWorld('42')).toThrow(SaveFormatError);
    expect(() => loadWorld('null')).toThrow(SaveFormatError);
  });

  it('refuse un format inconnu', () => {
    const payload = JSON.stringify({ fmt: 'autre-format', version: SCHEMA_VERSION, world: {} });
    expect(() => loadWorld(payload)).toThrow(SaveFormatError);
  });

  it('refuse une version de sauvegarde plus récente', () => {
    const w = world();
    const payload = JSON.stringify({ fmt: SAVE_FORMAT, version: 99, savedAtTick: 0, world: w });
    expect(() => loadWorld(payload)).toThrow(SaveVersionError);
  });

  it('refuse une version de schéma plus récente', () => {
    const w = { ...world(), schemaVersion: 99 };
    const payload = JSON.stringify({ fmt: SAVE_FORMAT, version: SCHEMA_VERSION, savedAtTick: 0, world: w });
    expect(() => loadWorld(payload)).toThrow(SaveVersionError);
  });

  it('refuse une enveloppe sans monde', () => {
    const payload = JSON.stringify({ fmt: SAVE_FORMAT, version: SCHEMA_VERSION, savedAtTick: 0 });
    expect(() => loadWorld(payload)).toThrow(SaveFormatError);
  });
});

describe('canonicalisation', () => {
  it('trie les clés récursivement', () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it('préserve l’ordre des tableaux', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });
});
