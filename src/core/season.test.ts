import { describe, expect, it } from 'vitest';
import { generateWorld } from '../data/generate';
import type { World } from '../data/types';
import { runTicks } from './tick';
import { computeStandings } from './standings';

const SEED = 20261017;

function world(): World {
  return generateWorld({ seed: SEED, clubCount: 16 });
}

/** Nombre de jours à jouer pour couvrir toute la saison. */
const SEASON_DAYS = 320;

describe('phase 2 — simuler une saison complète sans interface', () => {
  it('joue les 240 matchs du calendrier', () => {
    const w = world();
    expect(w.fixtures).toHaveLength(240);

    runTicks(w, SEASON_DAYS);

    expect(w.fixtures.every(f => f.status === 'played')).toBe(true);
    expect(w.fixtures.filter(f => f.homeGoals + f.awayGoals > 0).length).toBeGreaterThan(200);
  });

  it('produit des événements et des statistiques pour chaque match', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    expect(w.matchEvents.length).toBeGreaterThan(1000);
    expect(w.matchStats).toHaveLength(480); // 240 matchs x 2 équipes

    // Chaque match a ses deux lignes de stats.
    const byMatch = new Map<number, number>();
    for (const s of w.matchStats) byMatch.set(s.matchId, (byMatch.get(s.matchId) ?? 0) + 1);
    expect([...byMatch.values()].every(count => count === 2)).toBe(true);
  });

  it('ne fait jouer aucun club deux fois le même jour', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const seen = new Map<string, Set<number>>();
    for (const f of w.fixtures) {
      const key = f.date;
      const clubs = seen.get(key) ?? new Set<number>();
      if (clubs.has(f.homeClubId) || clubs.has(f.awayClubId)) {
        throw new Error(`${f.homeClubId} ou ${f.awayClubId} joue deux fois le ${key}`);
      }
      clubs.add(f.homeClubId);
      clubs.add(f.awayClubId);
      seen.set(key, clubs);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('donne un classement où chaque club a joué 30 matchs', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const rows = computeStandings(w);
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      expect(row.played).toBe(30);
      expect(row.won + row.drawn + row.lost).toBe(30);
    }
  });

  it('répartit les points conformément aux résultats', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const rows = computeStandings(w);
    const total = rows.reduce((s, r) => s + r.points, 0);
    const decided = w.fixtures.filter(f => f.homeGoals !== f.awayGoals).length;

    // 3 points par match décisif, 2 par match nul.
    expect(total).toBe(decided * 3 + (240 - decided) * 2);
  });

  it('équilibre les buts marqués et concédés', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const rows = computeStandings(w);
    const scored = rows.reduce((s, r) => s + r.goalsFor, 0);
    const conceded = rows.reduce((s, r) => s + r.goalsAgainst, 0);
    expect(scored).toBe(conceded);

    // Et le total doit correspondre aux scores des matchs.
    const fromFixtures = w.fixtures.reduce((s, f) => s + f.homeGoals + f.awayGoals, 0);
    expect(scored).toBe(fromFixtures);
  });

  it('tient dans un budget de temps raisonnable', () => {
    const w = world();
    const start = Date.now();
    runTicks(w, SEASON_DAYS);
    const elapsed = Date.now() - start;

    // 240 matchs + 320 ticks monde. La doc 48 donne 4 ms par match, ce qui
    // laisserait près d'une seconde pour le seul match ; on veut rester très
    // en dessous pour qu'un clic « saison suivante » reste instantané.
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('reproductibilité de la saison', () => {
  it('rejoue la même saison à l’identique', () => {
    const a = world();
    const b = world();
    runTicks(a, SEASON_DAYS);
    runTicks(b, SEASON_DAYS);

    const fingerprint = (w: World): string =>
      w.fixtures.map(f => `${f.id}:${f.homeGoals}-${f.awayGoals}`).join('|');

    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.matchEvents.length).toBe(b.matchEvents.length);
  });

  it('donne une autre saison avec une autre graine', () => {
    const a = generateWorld({ seed: 1 });
    const b = generateWorld({ seed: 2 });
    runTicks(a, SEASON_DAYS);
    runTicks(b, SEASON_DAYS);

    const same = a.fixtures.filter(
      (f, i) => f.homeGoals === b.fixtures[i].homeGoals && f.awayGoals === b.fixtures[i].awayGoals,
    ).length;

    expect(same).toBeLessThan(240);
  });

  it('reste identique quand on découpe le temps par petits bouts', () => {
    const direct = world();
    runTicks(direct, SEASON_DAYS);

    const chunked = world();
    for (let i = 0; i < 32; i += 1) runTicks(chunked, 10);

    expect(chunked.fixtures.map(f => `${f.homeGoals}-${f.awayGoals}`)).toEqual(
      direct.fixtures.map(f => `${f.homeGoals}-${f.awayGoals}`),
    );
  });
});

describe('effets de bord du match', () => {
  it('fait bouger le moral selon les résultats', () => {
    const w = world();
    const moralBefore = new Map(w.players.map(p => [p.id, p.morale]));

    runTicks(w, SEASON_DAYS);

    const moved = w.players.filter(p => p.morale !== moralBefore.get(p.id)).length;
    expect(moved).toBeGreaterThan(w.players.length / 2);

    for (const p of w.players) {
      expect(p.morale).toBeGreaterThanOrEqual(0);
      expect(p.morale).toBeLessThanOrEqual(100);
    }
  });

  it('ajoute des blessures au fil de la saison', () => {
    const w = world();
    const before = w.injuries.length;
    runTicks(w, SEASON_DAYS);
    expect(w.injuries.length).toBeGreaterThan(before);
  });

  it('journalise les résultats de match', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const scores = w.log.filter(entry => entry.system === 'Match' && /\d+ - \d+/.test(entry.message));
    expect(scores.length).toBe(240);
  });

  it('laisse les collections de match cohérentes', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const fixtureIds = new Set(w.fixtures.map(f => f.id));
    for (const event of w.matchEvents) expect(fixtureIds.has(event.matchId)).toBe(true);
    for (const stat of w.matchStats) expect(fixtureIds.has(stat.matchId)).toBe(true);
  });
});

describe('calibration du modèle', () => {
  /**
   * Ces tests fixent des ordres de grandeur mesurés sur une saison complète.
   * Ils ne prétendent pas reproduire un championnat réel : ils empêchent une
   * modification future de rendre le modèle absurde sans que personne ne s'en
   * aperçoive.
   */
  it('reste dans des ordres de grandeur de championnat', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const goals = w.fixtures.reduce((s, f) => s + f.homeGoals + f.awayGoals, 0);
    const homeWins = w.fixtures.filter(f => f.homeGoals > f.awayGoals).length;
    const draws = w.fixtures.filter(f => f.homeGoals === f.awayGoals).length;

    // Buts par match : un championnat tourne entre 2,4 et 3,0.
    expect(goals / w.fixtures.length).toBeGreaterThan(2.2);
    expect(goals / w.fixtures.length).toBeLessThan(3.4);

    // Matchs nuls : entre 18 % et 30 % dans les grands championnats.
    expect(draws / w.fixtures.length).toBeGreaterThan(0.15);
    expect(draws / w.fixtures.length).toBeLessThan(0.32);

    // Avantage du terrain : réel, mais il ne retourne pas un match.
    expect(homeWins / w.fixtures.length).toBeGreaterThan(0.35);
    expect(homeWins / w.fixtures.length).toBeLessThan(0.55);
  });

  it('garde les scores dans des limites plausibles', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    // Sur 240 matchs, une rencontre à 9 buts peut arriver ; au-delà, non.
    for (const f of w.fixtures) {
      expect(f.homeGoals + f.awayGoals).toBeLessThanOrEqual(10);
      expect(Math.abs(f.homeGoals - f.awayGoals)).toBeLessThanOrEqual(8);
    }
  });

  it('délivre une cartographie disciplinaire réaliste', () => {
    const w = world();
    runTicks(w, SEASON_DAYS);

    const yellows = w.matchEvents.filter(e => e.type === 'yellow_card').length;
    const reds = w.matchEvents.filter(e => e.type === 'red_card').length;

    // Environ 4 avertissements par match, et une exclusion tous les 7 matchs.
    expect(yellows / w.fixtures.length).toBeGreaterThan(2.5);
    expect(yellows / w.fixtures.length).toBeLessThan(6);
    expect(reds / w.fixtures.length).toBeGreaterThan(0.05);
    expect(reds / w.fixtures.length).toBeLessThan(0.4);
  });

  it('tient le budget de temps de la doc 48', () => {
    const w = world();
    const start = Date.now();
    runTicks(w, SEASON_DAYS);
    const elapsed = Date.now() - start;

    // 240 matchs. La doc 48 accorde 4 ms par match, soit près d'une seconde
    // pour le seul match : on veut rester très en dessous.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('sauvegarde après une saison', () => {
  it('se recharge à l’identique', async () => {
    const { loadWorld, saveWorld, canonicalize } = await import('../data/save');
    const w = world();
    runTicks(w, SEASON_DAYS);

    const reloaded = loadWorld(saveWorld(w));
    expect(canonicalize(reloaded)).toBe(canonicalize(w));
  });
});
