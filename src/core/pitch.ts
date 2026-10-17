/**
 * Cotes réglementaires du terrain et formation de départ.
 *
 * Module PUR : aucune dépendance au DOM, à Three.js ou au réseau.
 * Il est donc exécutable et testable directement sous Node.
 */

export const PITCH = {
  /** Longueur entre les lignes de but (mètres). */
  length: 105,
  /** Largeur entre les lignes de touche (mètres). */
  width: 68,
  centerCircleRadius: 9.15,
  penaltyAreaDepth: 16.5,
  penaltyAreaWidth: 40.3,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  /** Distance du point de penalty à la ligne de but. */
  penaltySpot: 11,
  goalWidth: 7.32,
  goalHeight: 2.44,
  goalDepth: 2,
  cornerArcRadius: 1,
} as const;

/** Bornes du terrain, repère centré : x = longueur, z = largeur. */
export const PITCH_BOUNDS = {
  minX: -PITCH.length / 2,
  maxX: PITCH.length / 2,
  minZ: -PITCH.width / 2,
  maxZ: PITCH.width / 2,
} as const;

export const TEAM_SIZE = 11;
export const PLAYER_COUNT = TEAM_SIZE * 2;

export type TeamIndex = 0 | 1;

/**
 * Formation 4-3-3, exprimée en coordonnées normalisées :
 *   x : 0 = sa propre ligne de but, 1 = ligne de but adverse
 *   z : 0 = ligne de touche gauche, 1 = ligne de touche droite
 * L'indice 0 est le gardien.
 */
const FORMATION_4_3_3: ReadonlyArray<readonly [number, number]> = [
  [0.04, 0.5],
  [0.2, 0.14],
  [0.18, 0.38],
  [0.18, 0.62],
  [0.2, 0.86],
  [0.44, 0.24],
  [0.4, 0.5],
  [0.44, 0.76],
  [0.7, 0.18],
  [0.73, 0.5],
  [0.7, 0.82],
];

export interface Slot {
  x: number;
  z: number;
}

/** Positions de départ d'une équipe, en mètres, dans le repère du terrain. */
export function formationSlots(team: TeamIndex): Slot[] {
  const direction = team === 0 ? -1 : 1;

  return FORMATION_4_3_3.map(([nx, nz]) => ({
    x: direction * (PITCH_BOUNDS.maxX - nx * PITCH.length),
    z: PITCH_BOUNDS.minZ + nz * PITCH.width,
  }));
}

/** Couleurs d'équipe (code hexadécimal, utilisé par le rendu et le repli 2D). */
export const TEAM_COLORS = {
  home: '#2563eb',
  away: '#f97316',
  goalkeeper: '#22d3ee',
} as const;

export function teamColorOf(team: TeamIndex, role: 'GK' | 'FIELD'): string {
  if (role === 'GK') return TEAM_COLORS.goalkeeper;
  return team === 0 ? TEAM_COLORS.home : TEAM_COLORS.away;
}
