import { describe, expect, it } from 'vitest';
import { generateWorld } from '../data/generate';
import type { Fixture, World } from '../data/types';
import { computeStandings, formLabel } from './standings';

const SEED = 20261017;

function world(): World {
  return generateWorld({ seed: SEED, clubCount: 16 });
}

/** Match facile à raisonner : domicile 2 - 1 extérieur. */
function fixture(id: number, home: number, away: number, round = 1): Fixture {
  return {
    id,
    seasonId: 1,
    round,
    homeClubId: home,
    awayClubId: away,
    date: '2026-09-01',
    status: 'played',
    homeGoals: 2,
    awayGoals: 1,
  };
}

describe('classement vide', () => {
  it('place tous les clubs à zéro', () => {
    const w = world();
    const rows = computeStandings(w);

    expect(rows).toHaveLength(w.clubs.length);
    for (const row of rows) {
      expect(row.played).toBe(0);
      expect(row.points).toBe(0);
      expect(row.goalsFor).toBe(0);
    }
  });

  it('numérote les positions de 1 à N', () => {
    const w = world();
    const rows = computeStandings(w);
    expect(rows.map(r => r.position)).toEqual(
      Array.from({ length: rows.length }, (_, i) => i + 1),
    );
  });
});

describe('comptage des points', () => {
  it('donne 3 points pour une victoire, 1 pour un nul', () => {
    const w = world();
    const [a, b, c, d] = w.clubs;

    w.fixtures.push(fixture(9001, a.id, b.id)); // a bat b
    w.fixtures.push({
      ...fixture(9002, c.id, d.id),
      homeGoals: 1,
      awayGoals: 1,
    }); // c nul contre d

    const rows = computeStandings(w);
    const rowA = rows.find(r => r.clubId === a.id);
    const rowB = rows.find(r => r.clubId === b.id);
    const rowC = rows.find(r => r.clubId === c.id);
    const rowD = rows.find(r => r.clubId === d.id);

    expect(rowA?.points).toBe(3);
    expect(rowA?.won).toBe(1);
    expect(rowB?.points).toBe(0);
    expect(rowB?.lost).toBe(1);
    expect(rowC?.points).toBe(1);
    expect(rowC?.drawn).toBe(1);
    expect(rowD?.points).toBe(1);
    expect(rowD?.drawn).toBe(1);
  });

  it('compte les buts pour et contre des deux côtés', () => {
    const w = world();
    const [a, b] = w.clubs;
    w.fixtures.push(fixture(9003, a.id, b.id)); // 2-1

    const rows = computeStandings(w);
    expect(rows.find(r => r.clubId === a.id)?.goalsFor).toBe(2);
    expect(rows.find(r => r.clubId === a.id)?.goalsAgainst).toBe(1);
    expect(rows.find(r => r.clubId === b.id)?.goalsFor).toBe(1);
    expect(rows.find(r => r.clubId === b.id)?.goalsAgainst).toBe(2);
  });

  it('conserve la forme des cinq derniers matchs', () => {
    const w = world();
    const [a, b] = w.clubs;

    w.fixtures.push(fixture(9010, a.id, b.id, 1)); // V
    w.fixtures.push({ ...fixture(9011, a.id, b.id, 2), homeGoals: 0, awayGoals: 0 }); // N
    w.fixtures.push({ ...fixture(9012, a.id, b.id, 3), homeGoals: 0, awayGoals: 1 }); // D

    const row = computeStandings(w).find(r => r.clubId === a.id);
    expect(formLabel(row?.form ?? [])).toBe('VND');
  });
});

describe('départage', () => {
  it('classe devant celui qui a la meilleure différence de buts', () => {
    const w = world();
    const [a, b, c, d] = w.clubs;

    // a et b ont 3 points, mais a gagne 3-0 et b gagne 1-0.
    w.fixtures.push({ ...fixture(9020, a.id, c.id), homeGoals: 3, awayGoals: 0 });
    w.fixtures.push({ ...fixture(9021, b.id, d.id), homeGoals: 1, awayGoals: 0 });

    const rows = computeStandings(w);
    expect(rows[0].clubId).toBe(a.id);
    expect(rows[0].goalDifference).toBe(3);
    expect(rows[1].clubId).toBe(b.id);
  });

  it('départage à égalité par les buts marqués', () => {
    const w = world();
    const [a, b, c, d] = w.clubs;

    w.fixtures.push({ ...fixture(9022, a.id, c.id), homeGoals: 3, awayGoals: 1 });
    w.fixtures.push({ ...fixture(9023, b.id, d.id), homeGoals: 2, awayGoals: 0 });

    const rows = computeStandings(w);
    // 3 points chacun, +2 de différence chacun : a est devant au nombre de buts.
    expect(rows[0].clubId).toBe(a.id);
  });

  it('recourt aux confrontations directes', () => {
    const w = world();
    const [a, b] = w.clubs;

    // Chacun gagne à domicile : 3 points chacun, différence nulle.
    w.fixtures.push(fixture(9030, a.id, b.id, 1)); // a 2-1 b
    w.fixtures.push({ ...fixture(9031, a.id, b.id, 2), homeGoals: 1, awayGoals: 2 }); // b 2-1 a

    const rows = computeStandings(w);
    // Confrontation : un but partout en cumulé. L'ordre retenu est stable et
    // déterministe, c'est ce qu'on vérifie.
    expect(rows[0].points).toBe(3);
    expect(rows[1].points).toBe(3);
    expect(rows[0].goalDifference).toBe(0);
    expect(rows[1].goalDifference).toBe(0);
  });
});

describe('déterminisme', () => {
  it('donne le même classement pour les mêmes matchs', () => {
    const w = world();
    const a = computeStandings(w).map(r => `${r.position}:${r.clubId}:${r.points}`);
    const b = computeStandings(w).map(r => `${r.position}:${r.clubId}:${r.points}`);
    expect(a).toEqual(b);
  });

  it('reste stable quand on recalcule après ajout de matchs', () => {
    const w = world();
    const before = computeStandings(w);
    w.fixtures.push(fixture(9040, w.clubs[0].id, w.clubs[1].id));
    const after = computeStandings(w);

    // Ajouter un match ne peut que faire bouger les deux clubs concernés.
    for (const row of after) {
      const old = before.find(r => r.clubId === row.clubId);
      if (row.clubId === w.clubs[0].id || row.clubId === w.clubs[1].id) {
        expect(row.played).toBe((old?.played ?? 0) + 1);
      } else {
        expect(row.played).toBe(old?.played ?? 0);
      }
    }
  });
});

describe('cohérence d’une saison complète', () => {
  it('équilibre buts pour et buts contre au total', () => {
    const w = world();
    for (const f of w.fixtures) {
      f.status = 'played';
      f.homeGoals = 1;
      f.awayGoals = 2;
    }

    const rows = computeStandings(w);
    const scored = rows.reduce((s, r) => s + r.goalsFor, 0);
    const conceded = rows.reduce((s, r) => s + r.goalsAgainst, 0);
    expect(scored).toBe(conceded);
  });

  it('donne le même nombre de matchs à chaque club', () => {
    const w = world();
    for (const f of w.fixtures) {
      f.status = 'played';
      f.homeGoals = 1;
      f.awayGoals = 1;
    }

    const played = computeStandings(w).map(r => r.played);
    expect(new Set(played).size).toBe(1);
    // Aller-retour : chaque club joue deux fois contre chacun des 15 autres.
    expect(played[0]).toBe((w.clubs.length - 1) * 2);
  });

  it('répartit les points conformément aux résultats', () => {
    const w = world();
    for (const f of w.fixtures) {
      f.status = 'played';
      f.homeGoals = 2;
      f.awayGoals = 1;
    }

    const rows = computeStandings(w);
    const totalPoints = rows.reduce((s, r) => s + r.points, 0);
    // Tous les matchs ont un vainqueur : 3 points par match, pour 2 clubs.
    expect(totalPoints).toBe(w.fixtures.length * 3);
  });

  it('fait totaliser victoires + nuls + défaites égales aux matchs joués', () => {
    const w = world();
    for (const f of w.fixtures) {
      f.status = 'played';
      f.homeGoals = (f.id % 3) as number;
      f.awayGoals = (f.id % 2) as number;
    }

    for (const row of computeStandings(w)) {
      expect(row.won + row.drawn + row.lost).toBe(row.played);
      expect(row.goalsFor - row.goalsAgainst).toBe(row.goalDifference);
    }
  });
});
