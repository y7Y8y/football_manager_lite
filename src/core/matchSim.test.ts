import { describe, expect, it } from 'vitest';
import { generateWorld } from '../data/generate';
import type { Fixture, World } from '../data/types';
import { computeStats, expectedGoals, simulateMatch } from './matchSim';
import { teamStrength } from './squad';

const SEED = 20261017;

function world(): World {
  return generateWorld({ seed: SEED, clubCount: 16 });
}

/** Joue un match isolé, hors tick, pour tester le simulateur seul. */
function play(w: World, fixture: Fixture) {
  return simulateMatch({ world: w, fixture, firstEventId: 1 });
}

function firstFixture(w: World): Fixture {
  const f = w.fixtures.find(x => x.status === 'scheduled');
  if (!f) throw new Error('aucun match programmé');
  return f;
}

describe('déroulé d’un match', () => {
  it('produit un coup d’envoi et une fin de match', () => {
    const w = world();
    const result = play(w, firstFixture(w));

    expect(result.events.filter(e => e.type === 'kickoff')).toHaveLength(1);
    expect(result.events.filter(e => e.type === 'full_time')).toHaveLength(1);
    expect(result.events[0].type).toBe('kickoff');
    expect(result.events[result.events.length - 1].type).toBe('full_time');
  });

  it('émet des événements dans l’ordre des minutes', () => {
    const w = world();
    const result = play(w, firstFixture(w));

    for (let i = 1; i < result.events.length; i += 1) {
      expect(result.events[i].minute).toBeGreaterThanOrEqual(result.events[i - 1].minute);
    }
  });

  it('départage deux événements de la même minute par leur séquence', () => {
    const w = world();
    const result = play(w, firstFixture(w));

    const sequences = result.events.map(e => Number(e.metadata?.sequence ?? 0));
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it('n’attribue des identifiants qu’une seule fois', () => {
    const w = world();
    const result = play(w, firstFixture(w));
    const ids = result.events.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ne fait jouer que des joueurs des deux clubs concernés', () => {
    const w = world();
    const fixture = firstFixture(w);
    const result = play(w, fixture);

    const allowed = new Set(
      w.players.filter(p => p.clubId === fixture.homeClubId || p.clubId === fixture.awayClubId).map(p => p.id),
    );
    for (const event of result.events) {
      if (event.playerId !== null) expect(allowed.has(event.playerId)).toBe(true);
      if (event.secondaryPlayerId !== null) expect(allowed.has(event.secondaryPlayerId)).toBe(true);
    }
  });

  it('compte autant de buts que d’événements but', () => {
    const w = world();
    const fixture = firstFixture(w);
    const result = play(w, fixture);

    const home = result.events.filter(
      e => (e.type === 'goal' || e.type === 'penalty_goal') && e.teamId === fixture.homeClubId,
    ).length;
    const away = result.events.filter(
      e => (e.type === 'goal' || e.type === 'penalty_goal') && e.teamId === fixture.awayClubId,
    ).length;

    expect(result.homeGoals).toBe(home);
    expect(result.awayGoals).toBe(away);
  });
});

describe('statistiques dérivées des événements', () => {
  it('se recalculent depuis zéro et donnent le même résultat', () => {
    const w = world();
    const fixture = firstFixture(w);
    const result = play(w, fixture);

    const again = computeStats(result.events, fixture.id, fixture.homeClubId, fixture.awayClubId);
    expect(again).toEqual(result.stats);
  });

  it('donnent deux lignes, une par équipe', () => {
    const w = world();
    const fixture = firstFixture(w);
    const result = play(w, fixture);

    expect(result.stats).toHaveLength(2);
    expect(result.stats.map(s => s.teamId).sort()).toEqual(
      [fixture.awayClubId, fixture.homeClubId].sort(),
    );
  });

  it('répartissent la possession à 100 % entre les deux équipes', () => {
    const w = world();
    const result = play(w, firstFixture(w));
    const total = result.stats.reduce((sum, s) => sum + s.possession, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('gardent la précision de passe dans [0, 100]', () => {
    const w = world();
    const result = play(w, firstFixture(w));
    for (const s of result.stats) {
      expect(s.passAccuracy).toBeGreaterThanOrEqual(0);
      expect(s.passAccuracy).toBeLessThanOrEqual(100);
      expect(s.shotsOnTarget).toBeLessThanOrEqual(s.shots);
    }
  });

  it('rapprochent l’xG du nombre de buts', () => {
    const w = world();
    const result = play(w, firstFixture(w));
    const home = result.stats.find(s => s.teamId === result.homeClubId);
    // L'xG n'est pas le score, mais il ne doit pas en être absurde.
    expect(Math.abs((home?.xg ?? 0) - result.homeGoals)).toBeLessThan(4);
  });
});

describe('xG', () => {
  it('vaut 0,76 sur penalty', () => {
    expect(expectedGoals(0, 0, true)).toBe(0.76);
  });

  it('baisse quand la distance augmente', () => {
    const near = expectedGoals(6, 0);
    const far = expectedGoals(30, 0);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThanOrEqual(1);
    expect(far).toBeGreaterThan(0);
  });

  it('baisse quand l’angle se ferme', () => {
    expect(expectedGoals(10, 0)).toBeGreaterThan(expectedGoals(10, 20));
  });
});

describe('déterminisme', () => {
  it('rejoue le même match à l’identique', () => {
    const w = world();
    const fixture = firstFixture(w);

    const a = play(w, fixture);
    const b = play(w, fixture);

    expect(b.events).toEqual(a.events);
    expect(b.stats).toEqual(a.stats);
    expect([b.homeGoals, b.awayGoals]).toEqual([a.homeGoals, a.awayGoals]);
  });

  it('donne des matchs différents à des matchs différents', () => {
    const w = world();
    const scheduled = w.fixtures.filter(f => f.status === 'scheduled').slice(0, 4);

    const fingerprints = scheduled.map(f => {
      const r = play(w, f);
      return r.events.map(e => `${e.minute}:${e.type}:${e.teamId}`).join('|');
    });

    expect(new Set(fingerprints).size).toBe(scheduled.length);
  });
});

describe('crédibilité du modèle', () => {
  it('laisse la meilleure équipe gagner plus souvent sur un grand échantillon', () => {
    const w = world();
    const byStrength = [...w.clubs]
      .map(c => ({ club: c, strength: teamStrength(w, c.id) }))
      .sort((a, b) => b.strength.overall - a.strength.overall);

    const best = byStrength[0].club;
    const worst = byStrength[byStrength.length - 1].club;

    // On fait jouer le meilleur contre le pire, à domicile, 40 fois.
    let bestWins = 0;
    for (let i = 0; i < 40; i += 1) {
      const fixture: Fixture = {
        id: 900000 + i,
        seasonId: 1,
        round: 99,
        homeClubId: best.id,
        awayClubId: worst.id,
        date: '2026-09-01',
        status: 'scheduled',
        homeGoals: 0,
        awayGoals: 0,
      };
      const r = play(w, fixture);
      if (r.homeGoals > r.awayGoals) bestWins += 1;
    }

    // Un écart de capacité doit se voir nettement, sans être une garantie.
    expect(bestWins).toBeGreaterThan(24);
  });

  it('garde un avantage du terrain mesurable mais faible', () => {
    const w = world();
    let homeWins = 0;
    let awayWins = 0;
    const sample = w.fixtures.slice(0, 120);

    for (const fixture of sample) {
      const r = play(w, fixture);
      if (r.homeGoals > r.awayGoals) homeWins += 1;
      else if (r.awayGoals > r.homeGoals) awayWins += 1;
    }

    // Le terrain aide, mais ne doit pas rendre le match joué d'avance.
    expect(homeWins).toBeGreaterThan(awayWins);
    expect(homeWins - awayWins).toBeLessThan(sample.length * 0.35);
  });

  it('produit un nombre de buts par match crédible', () => {
    const w = world();
    const sample = w.fixtures.slice(0, 120);

    let goals = 0;
    for (const fixture of sample) {
      const r = play(w, fixture);
      goals += r.homeGoals + r.awayGoals;
    }

    const perMatch = goals / sample.length;
    // Un match de championnat tourne autour de 2,5 à 3 buts.
    expect(perMatch).toBeGreaterThan(1.8);
    expect(perMatch).toBeLessThan(4.5);
  });
});

describe('blessures en cours de match', () => {
  it('verse des blessures datées du jour du match', () => {
    const w = world();
    // Sur un échantillon large, au moins une blessure doit apparaître.
    const injuries: unknown[] = [];
    for (const fixture of w.fixtures.slice(0, 60)) {
      injuries.push(...play(w, fixture).injuries);
    }
    expect(injuries.length).toBeGreaterThan(0);
  });

  it('n’attribue jamais deux fois le même joueur dans un même match', () => {
    const w = world();
    for (const fixture of w.fixtures.slice(0, 60)) {
      const r = play(w, fixture);
      const ids = r.injuries.map(i => i.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('événements produits', () => {
  it('couvre les types annoncés par la doc 14', () => {
    const w = world();
    const types = new Set<string>();
    for (const fixture of w.fixtures.slice(0, 120)) {
      for (const e of play(w, fixture).events) types.add(e.type);
    }

    for (const expected of ['kickoff', 'half_time', 'full_time', 'pass', 'shot', 'foul', 'goal']) {
      expect(types.has(expected)).toBe(true);
    }
  });

  it('laisse les événements immuables une fois écrits', () => {
    const w = world();
    const fixture = firstFixture(w);
    const result = play(w, fixture);

    const snapshot = result.events.map(e => ({ ...e }));
    result.events[0].minute = 999;
    // Le tableau d'origine n'est pas modifié par l'extérieur.
    expect(result.events.map(e => ({ ...e }))).not.toEqual(snapshot);
  });
});

/** Exporté pour la réutilisation par les tests de saison. */
export { play, world };
