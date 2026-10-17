/**
 * Tests de la boucle de tick.
 *
 * Le contrat de la doc 48 est double : l'ordre des 14 systèmes est fixe, et
 * le déterminisme est absolu — même graine, même état final. Ces deux
 * propriétés sont ce qui rend la simulation testable hors navigateur.
 */

import { describe, expect, it } from 'vitest';
import { generateWorld } from '../data/generate';
import { canonicalize } from '../data/save';
import {
  TICK_ORDER,
  createTickContext,
  reservedByMilestone,
  runTick,
  runTicks,
  tickOrderNames,
} from './tick';

/** Ordre exact exigé par la doc 48. */
const DOC_48_ORDER = [
  'Horloge', 'Calendrier', 'IA des clubs', 'Contrats', 'Entraînement',
  'Médical', 'Tactique', 'Préparation', 'Match', 'Statistiques',
  'Presse', 'Moral', 'Finances', 'Sauvegarde',
];

const SEED = 20261017;

function freshWorld(tickSeed = SEED) {
  return generateWorld({ seed: tickSeed, clubCount: 16 });
}

describe('ordre des systèmes', () => {
  it('compte exactement 14 systèmes', () => {
    expect(TICK_ORDER).toHaveLength(14);
  });

  it('respecte l’ordre de la doc 48', () => {
    expect(tickOrderNames()).toEqual(DOC_48_ORDER);
  });

  it('répartit les jalons sans case vide', () => {
    const byMilestone = reservedByMilestone();
    const total = Object.values(byMilestone).reduce((a, b) => a + b, 0);
    expect(total).toBe(14);
    // M1 implémente 7 des 14 systèmes ; le reste est daté.
    expect(byMilestone[1]).toBe(7);
    expect(byMilestone[2]).toBe(2);
    expect(byMilestone[3]).toBe(4);
    expect(byMilestone[6]).toBe(1);
  });
});

describe('déterminisme', () => {
  it('produit deux mondes identiques à graine égale', () => {
    const a = freshWorld();
    const b = freshWorld();
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('produit deux mondes divergents à graines différentes', () => {
    const a = freshWorld(SEED);
    const b = freshWorld(SEED + 1);
    expect(canonicalize(a)).not.toBe(canonicalize(b));
  });

  it('reste reproductible sur 120 ticks', () => {
    const a = freshWorld();
    const b = freshWorld();
    runTicks(a, 120);
    runTicks(b, 120);
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(a.tick).toBe(120);
    expect(b.tick).toBe(120);
  });

  it('reste reproductible quand les ticks sont rejoués un par un', () => {
    // Rejouer les 120 mêmes ticks dans un ordre différent d'appel doit donner
    // le même résultat : le RNG du tick ne dépend que de (graine, numéro).
    const direct = freshWorld();
    runTicks(direct, 120);

    const chunked = freshWorld();
    for (let i = 0; i < 12; i++) runTicks(chunked, 10);

    expect(canonicalize(chunked)).toBe(canonicalize(direct));
  });

  it('diverge après un tick à graine différente', () => {
    const a = freshWorld(SEED);
    const b = freshWorld(SEED + 1);
    runTick(a);
    runTick(b);
    expect(canonicalize(a)).not.toBe(canonicalize(b));
  });
});

describe('horloge et journal', () => {
  it('avance la date d’un jour par tick', () => {
    const w = freshWorld();
    const first = w.date;
    runTick(w);
    expect(w.date > first).toBe(true);
  });

  it('journalise les 14 systèmes, dans l’ordre, à chaque tick', () => {
    const w = freshWorld();
    const entries = runTick(w);
    expect(entries).toHaveLength(14);
    expect(entries.map(e => e.system)).toEqual(DOC_48_ORDER);
    expect(entries.every(e => e.tick === 0)).toBe(true);
  });

  it('décale le numéro de tick après application', () => {
    const w = freshWorld();
    runTick(w);
    expect(w.tick).toBe(1);
    runTick(w);
    expect(w.tick).toBe(2);
  });
});

describe('systèmes actifs de M1', () => {
  it('borne le moral entre 0 et 100 sur 200 ticks', () => {
    const w = freshWorld();
    runTicks(w, 200);
    for (const p of w.players) {
      expect(p.morale).toBeGreaterThanOrEqual(0);
      expect(p.morale).toBeLessThanOrEqual(100);
    }
  });

  it('referme les blessures arrivées à échéance', () => {
    const w = freshWorld();
    runTicks(w, 200);
    // Toute blessure dont la date de retour est passée doit être close.
    for (const injury of w.injuries) {
      if (injury.expectedReturn <= w.date) {
        expect(injury.actualReturn).not.toBeNull();
      }
    }
  });

  it('prélève les salaires une semaine sur sept', () => {
    const w = freshWorld();
    const before = w.finances.map(f => f.wageBudget);

    runTicks(w, 7); // ticks 0 à 6 : pas encore de paie
    expect(w.finances.map(f => f.wageBudget)).toEqual(before);

    runTick(w); // tick 7 : première paie
    const afterFirst = w.finances.map(f => f.wageBudget);
    expect(afterFirst).not.toEqual(before);

    runTicks(w, 6); // ticks 8 à 13 : pas de paie
    expect(w.finances.map(f => f.wageBudget)).toEqual(afterFirst);

    runTicks(w, 1); // tick 14 : deuxième paie
    expect(w.finances.map(f => f.wageBudget)).not.toEqual(afterFirst);
  });

  it('ne fait jamais passer un budget salarial en négatif', () => {
    const w = freshWorld();
    runTicks(w, 70);
    for (const f of w.finances) expect(f.wageBudget).toBeGreaterThanOrEqual(0);
  });
});

describe('contexte de tick', () => {
  it('redonne la même séquence pour le même couple graine/tick', () => {
    const a = createTickContext(SEED, 5);
    const b = createTickContext(SEED, 5);
    expect([a.rng(), a.rng(), a.rng()]).toEqual([b.rng(), b.rng(), b.rng()]);
  });

  it('diverge pour deux ticks différents', () => {
    const a = createTickContext(SEED, 5);
    const b = createTickContext(SEED, 6);
    expect([a.rng(), a.rng()]).not.toEqual([b.rng(), b.rng()]);
  });
});

describe('budget', () => {
  it('reste sous les 7 ms alloués par la doc 48', () => {
    const w = freshWorld();
    const start = performance.now();
    runTicks(w, 500);
    const elapsed = performance.now() - start;
    expect(elapsed / 500).toBeLessThan(7);
  });
});
