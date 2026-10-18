/**
 * Classement, calculé depuis les matchs.
 *
 * La doc 25 est explicite : le classement n'est JAMAIS stocké, il se calcule
 * depuis les matchs. Ce module est donc une fonction pure de `fixtures`, sans
 * aucun état conservé. On peut le recalculer à chaque affichage.
 *
 * Départage retenu (doc 17) :
 *   1. points
 *   2. différence de buts
 *   3. buts marqués
 *   4. confrontations directes
 *   5. tirage au sort déterministe (graine du monde), jamais le hasard réel
 *
 * Le dernier point est délibéré : un tirage au sort non seedé casserait le
 * déterminisme, et deux machines ne donneraient plus le même classement.
 */

import type { Fixture, World } from '../data/types';

export interface StandingRow {
  clubId: number;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Résultats des 5 derniers matchs, du plus ancien au plus récent. */
  form: ('V' | 'N' | 'D')[];
}

/** Matchs déjà joués, dans l'ordre du calendrier. */
function playedFixtures(world: World): Fixture[] {
  return world.fixtures
    .filter(f => f.status === 'played')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.round - b.round));
}

/**
 * Confrontations directes entre deux clubs, pour le départage 4.
 * Renvoie les points du club `clubId` face à `opponentId`.
 */
function headToHead(
  fixtures: Fixture[],
  clubId: number,
  opponentId: number,
): { clubPoints: number; opponentPoints: number } {
  let clubPoints = 0;
  let opponentPoints = 0;

  for (const f of fixtures) {
    const isHome = f.homeClubId === clubId && f.awayClubId === opponentId;
    const isAway = f.homeClubId === opponentId && f.awayClubId === clubId;
    if (!isHome && !isAway) continue;

    const clubGoals = isHome ? f.homeGoals : f.awayGoals;
    const opponentGoals = isHome ? f.awayGoals : f.homeGoals;

    if (clubGoals > opponentGoals) clubPoints += 3;
    else if (clubGoals < opponentGoals) opponentPoints += 3;
    else {
      clubPoints += 1;
      opponentPoints += 1;
    }
  }

  return { clubPoints, opponentPoints };
}

/**
 * Classement complet d'une saison. Fonction pure : mêmes matchs -> même
 * classement, sur n'importe quelle machine.
 */
export function computeStandings(world: World): StandingRow[] {
  const fixtures = playedFixtures(world);
  const seasonClubIds = new Set<number>();
  for (const f of world.fixtures) {
    seasonClubIds.add(f.homeClubId);
    seasonClubIds.add(f.awayClubId);
  }

  const rows = new Map<number, StandingRow>();
  for (const clubId of seasonClubIds) {
    rows.set(clubId, {
      clubId,
      position: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    });
  }

  for (const f of fixtures) {
    for (const [clubId, isHome] of [
      [f.homeClubId, true],
      [f.awayClubId, false],
    ] as const) {
      const row = rows.get(clubId);
      if (!row) continue;

      const scored = isHome ? f.homeGoals : f.awayGoals;
      const conceded = isHome ? f.awayGoals : f.homeGoals;

      row.played += 1;
      row.goalsFor += scored;
      row.goalsAgainst += conceded;

      if (scored > conceded) {
        row.won += 1;
        row.points += 3;
        row.form.push('V');
      } else if (scored < conceded) {
        row.lost += 1;
        row.form.push('D');
      } else {
        row.drawn += 1;
        row.points += 1;
        row.form.push('N');
      }
      if (row.form.length > 5) row.form.shift();
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  // Tri primaire : points, différence, buts marqués. Le départage final
  // (confrontations, puis graine) n'est appliqué qu'aux ex aequo, ce qui
  // évite de comparer toutes les paires.
  const ordered = [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });

  // Regroupement des ex aequo pour appliquer les départages 4 et 5.
  const groups: StandingRow[][] = [];
  for (const row of ordered) {
    const last = groups[groups.length - 1];
    const same =
      last &&
      last[0].points === row.points &&
      last[0].goalDifference === row.goalDifference &&
      last[0].goalsFor === row.goalsFor;
    if (same) last.push(row);
    else groups.push([row]);
  }

  const final: StandingRow[] = [];
  for (const group of groups) {
    if (group.length > 1) {
      group.sort((a, b) => {
        const h2h = headToHead(fixtures, a.clubId, b.clubId);
        if (h2h.clubPoints !== h2h.opponentPoints) {
          return h2h.opponentPoints - h2h.clubPoints;
        }
        // Dernier recours : ordre stable dérivé de la graine du monde, pour
        // que deux exécutions donnent le même classement.
        const sa = mix(world.seed, a.clubId);
        const sb = mix(world.seed, b.clubId);
        if (sa !== sb) return sa - sb;
        return a.clubId - b.clubId;
      });
    }
    final.push(...group);
  }

  final.forEach((row, index) => {
    row.position = index + 1;
  });

  return final;
}

/** Mélange déterministe d'une graine et d'un identifiant. */
function mix(seed: number, id: number): number {
  let z = (seed >>> 0) ^ Math.imul(id + 1, 0x9e3779b9);
  z = (z ^ (z >>> 16)) >>> 0;
  z = Math.imul(z, 0x21f0aaad) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  z = Math.imul(z, 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/** Libellé de forme, pour l'affichage : « VVNDV ». */
export function formLabel(form: StandingRow['form']): string {
  return form.join('');
}
