/**
 * Sélection d'équipe et évaluation de sa force.
 *
 * La doc 42 demande une IA de match crédible ; la doc 48 lui accorde 4 ms par
 * match. On ne peut pas se payer une simulation spatiale de 22 joueurs pour
 * 240 matchs de championnat : on évalue donc la force d'un groupe de façon
 * **lisible**, poste par poste, et on laisse le simulateur de match s'en
 * servir. Tout est déterministe.
 */

import type { Player, Position, Tactic, World } from '../data/types';

/** Poste par poste, les 11 joueurs de champ visés par la composition générée. */
const STARTING_SHAPE: readonly Position[] = [
  'GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'AM', 'ST', 'ST',
];

const ATTACK_POSITIONS: readonly Position[] = ['AM', 'ST', 'WL', 'WR'];
const MIDFIELD_POSITIONS: readonly Position[] = ['MC', 'ML', 'MR', 'DM'];
const DEFENCE_POSITIONS: readonly Position[] = ['DL', 'DC', 'DR'];

/** Blessure en cours : le joueur n'est pas sélectionnable. */
function isAvailable(world: World, playerId: number): boolean {
  return !world.injuries.some(i => i.playerId === playerId && i.actualReturn === null);
}

/**
 * Les 11 titulaires d'un club. On part de la composition enregistrée dans
 * `tacticSlots` ; un slot vide est pourvu par le meilleur joueur disponible
 * au poste, puis, à défaut, par le meilleur restant.
 */
export function selectStartingXI(world: World, clubId: number): Player[] {
  const squad = world.players.filter(p => p.clubId === clubId);
  const tactic = world.tactics.find(t => t.clubId === clubId);
  const slots = tactic ? world.tacticSlots.filter(s => s.tacticId === tactic.id) : [];

  const byId = new Map(squad.map(p => [p.id, p]));
  const used = new Set<number>();
  const xi: Player[] = [];

  // 1. Les joueurs déjà désignés par la composition.
  for (const position of STARTING_SHAPE) {
    const slot = slots.find(s => s.position === position && s.playerId !== null);
    const player = slot && slot.playerId !== null ? byId.get(slot.playerId) : undefined;
    if (player && !used.has(player.id) && isAvailable(world, player.id)) {
      used.add(player.id);
      xi.push(player);
    }
  }

  // 2. Les postes encore libres : meilleur disponible au poste.
  const pool = () => squad.filter(p => !used.has(p.id) && isAvailable(world, p.id));

  for (const position of STARTING_SHAPE) {
    if (xi.length >= STARTING_SHAPE.length) break;
    if (xi.some(p => p.position === position) && STARTING_SHAPE.filter(s => s === position).length <= xi.filter(p => p.position === position).length) {
      continue;
    }
    const candidate = pool()
      .filter(p => p.position === position)
      .sort((a, b) => b.ca - a.ca)[0];
    if (candidate) {
      used.add(candidate.id);
      xi.push(candidate);
    }
  }

  // 3. Dernier recours : on complète avec les meilleurs restants.
  while (xi.length < STARTING_SHAPE.length) {
    const candidate = pool().sort((a, b) => b.ca - a.ca)[0];
    if (!candidate) break;
    used.add(candidate.id);
    xi.push(candidate);
  }

  return xi;
}

function average(players: Player[], positions: readonly Position[]): number {
  const selected = players.filter(p => positions.includes(p.position));
  if (selected.length === 0) return 50;
  return selected.reduce((sum, p) => sum + p.ca, 0) / selected.length;
}

export interface TeamStrength {
  clubId: number;
  /** Force globale 0–100, moyenne de capacité des 11 titulaires. */
  overall: number;
  /** Puissance offensive 0–100. */
  attack: number;
  /** Solidité défensive 0–100. */
  defence: number;
  /** Qualité du milieu, qui porte la possession. */
  midfield: number;
  tactic: Tactic | null;
}

/**
 * Force d'une équipe. Les poids sont les nôtres, pas ceux d'un jeu existant :
 * la doc 26 nomme « formules copiées » comme risque et demande de concevoir
 * et tester les siennes.
 */
export function teamStrength(world: World, clubId: number): TeamStrength {
  const xi = selectStartingXI(world, clubId);
  const tactic = world.tactics.find(t => t.clubId === clubId) ?? null;

  const overall = xi.length
    ? xi.reduce((sum, p) => sum + p.ca, 0) / xi.length
    : 50;

  const attack =
    0.55 * average(xi, ATTACK_POSITIONS) +
    0.30 * average(xi, MIDFIELD_POSITIONS) +
    0.15 * average(xi, DEFENCE_POSITIONS);

  const defence =
    0.55 * average(xi, DEFENCE_POSITIONS) +
    0.30 * average(xi, MIDFIELD_POSITIONS) +
    0.15 * average(xi, ['GK']);

  const midfield = average(xi, MIDFIELD_POSITIONS);

  // La mentalité déplace le curseur entre prendre des risques et se protéger.
  const mentality = tactic?.mentality ?? 'balanced';
  const shift: Record<Tactic['mentality'], { a: number; d: number }> = {
    defensive: { a: 0.92, d: 1.07 },
    balanced: { a: 1.0, d: 1.0 },
    positive: { a: 1.04, d: 0.98 },
    attacking: { a: 1.09, d: 0.93 },
  };
  const { a, d } = shift[mentality];

  return {
    clubId,
    overall,
    attack: Math.min(100, attack * a),
    defence: Math.min(100, defence * d),
    midfield,
    tactic,
  };
}
