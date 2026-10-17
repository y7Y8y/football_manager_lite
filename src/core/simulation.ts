/**
 * Noyau de simulation : 22 joueurs, un ballon, des déplacements et des passes.
 *
 * VOLONTAIREMENT ÉLÉMENTAIRE. Le but de FMT-1 est de valider l'aperçu web et
 * la séparation simulation / rendu, pas de simuler un match de football.
 * Ce module ne contient AUCUNE référence au DOM, à Three.js ou au réseau :
 * il tourne donc tel quel sous Node, ce qui permet de le tester.
 *
 * Déterminisme : tous les tirages aléatoires passent par le générateur fourni
 * en argument, appelé dans un ordre fixe. Même graine => même résultat.
 */

import { createRng, mixSeed } from './rng';
import {
  PITCH_BOUNDS,
  PLAYER_COUNT,
  TEAM_SIZE,
  formationSlots,
  type TeamIndex,
} from './pitch';

export type Role = 'GK' | 'FIELD';

export interface PlayerState {
  id: number;
  team: TeamIndex;
  role: Role;
  /** Position courante (mètres). */
  x: number;
  z: number;
  /** Slot d'attache (position de repos). */
  hx: number;
  hz: number;
  /** Cible courante. */
  tx: number;
  tz: number;
  /** Vitesse de déplacement (m/s). */
  speed: number;
}

export interface BallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface MatchState {
  seed: number;
  /** Nombre de pas de simulation écoulés. */
  tick: number;
  /** Temps simulé écoulé (secondes). */
  time: number;
  players: PlayerState[];
  ball: BallState;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Marge de sécurité pour empêcher les acteurs de franchir les lignes. */
const MARGIN = 1.5;
const BALL_MARGIN = 0.4;

/** Amplitude du déplacement aléatoire autour du slot d'attache (mètres). */
const ROAM_X = 7;
const ROAM_Z = 5;

/** Probabilité par seconde qu'un joueur change de cible. */
const RETARGET_RATE = 0.4;

/** En dessous de cette vitesse (m/s), le ballon est considéré comme récupérable. */
const LOOSE_BALL_SPEED = 0.6;

const MAX_PASS_SPEED = 18;

/** État initial : 22 joueurs sur leur formation, ballon au centre. */
export function createMatch(seed: number): MatchState {
  const rng = createRng(mixSeed(seed));
  const players: PlayerState[] = [];

  for (const team of [0, 1] as TeamIndex[]) {
    const slots = formationSlots(team);

    slots.forEach((slot, index) => {
      const jitterX = (rng() * 2 - 1) * 1.2;
      const jitterZ = (rng() * 2 - 1) * 1.2;

      players.push({
        id: players.length,
        team,
        role: index === 0 ? 'GK' : 'FIELD',
        x: slot.x + jitterX,
        z: slot.z + jitterZ,
        hx: slot.x,
        hz: slot.z,
        tx: slot.x + jitterX,
        tz: slot.z + jitterZ,
        speed: 4.2 + rng() * 1.6,
      });
    });
  }

  return {
    seed,
    tick: 0,
    time: 0,
    players,
    ball: { x: 0, z: 0, vx: 0, vz: 0 },
  };
}

/**
 * Avance la simulation d'un pas de temps `dt` (secondes).
 * L'état est modifié sur place ; le générateur `rng` est passé par l'appelant
 * afin qu'une même graine produise exactement la même partie.
 */
export function stepMatch(state: MatchState, dt: number, rng: () => number): void {
  state.tick += 1;
  state.time += dt;

  // 1. Déplacements des joueurs vers leur cible courante.
  for (const player of state.players) {
    if (rng() < dt * RETARGET_RATE) {
      player.tx = clamp(
        player.hx + (rng() * 2 - 1) * ROAM_X,
        PITCH_BOUNDS.minX + MARGIN,
        PITCH_BOUNDS.maxX - MARGIN,
      );
      player.tz = clamp(
        player.hz + (rng() * 2 - 1) * ROAM_Z,
        PITCH_BOUNDS.minZ + MARGIN,
        PITCH_BOUNDS.maxZ - MARGIN,
      );
    }

    const dx = player.tx - player.x;
    const dz = player.tz - player.z;
    const distance = Math.hypot(dx, dz);

    if (distance > 0.05) {
      const stepLength = Math.min(distance, player.speed * dt);
      player.x += (dx / distance) * stepLength;
      player.z += (dz / distance) * stepLength;
    }
  }

  // 2. Ballon : déplacement, frottement, rebonds sur les lignes.
  const ball = state.ball;
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  const friction = Math.max(0, 1 - 1.1 * dt);
  ball.vx *= friction;
  ball.vz *= friction;

  if (ball.x < PITCH_BOUNDS.minX + BALL_MARGIN) {
    ball.x = PITCH_BOUNDS.minX + BALL_MARGIN;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x > PITCH_BOUNDS.maxX - BALL_MARGIN) {
    ball.x = PITCH_BOUNDS.maxX - BALL_MARGIN;
    ball.vx = -Math.abs(ball.vx);
  }

  if (ball.z < PITCH_BOUNDS.minZ + BALL_MARGIN) {
    ball.z = PITCH_BOUNDS.minZ + BALL_MARGIN;
    ball.vz = Math.abs(ball.vz);
  } else if (ball.z > PITCH_BOUNDS.maxZ - BALL_MARGIN) {
    ball.z = PITCH_BOUNDS.maxZ - BALL_MARGIN;
    ball.vz = -Math.abs(ball.vz);
  }

  // 3. Passe : quand le ballon ralentit, il est envoyé vers un joueur.
  if (Math.hypot(ball.vx, ball.vz) < LOOSE_BALL_SPEED) {
    const receiver = state.players[Math.floor(rng() * PLAYER_COUNT) % PLAYER_COUNT];
    const dx = receiver.x - ball.x;
    const dz = receiver.z - ball.z;
    const distance = Math.max(0.5, Math.hypot(dx, dz));
    const power = Math.min(MAX_PASS_SPEED, 6 + distance * 0.8);
    const angle = Math.atan2(dz, dx) + (rng() * 2 - 1) * 0.12;

    ball.vx = Math.cos(angle) * power;
    ball.vz = Math.sin(angle) * power;
  }
}

/** Nombre de joueurs attendus sur le terrain. */
export function countPlayers(state: MatchState): { total: number; home: number; away: number } {
  return {
    total: state.players.length,
    home: state.players.filter((p) => p.team === 0).length,
    away: state.players.filter((p) => p.team === 1).length,
  };
}

/** Empreinte compacte de l'état, pour comparer deux parties. */
export function fingerprint(state: MatchState): string {
  const round = (value: number): number => Math.round(value * 1000) / 1000;

  return JSON.stringify({
    seed: state.seed,
    tick: state.tick,
    time: Math.round(state.time * 1000) / 1000,
    ball: [round(state.ball.x), round(state.ball.z)],
    players: state.players.map((p) => [round(p.x), round(p.z)]),
  });
}

/**
 * Rejoue une partie complète hors navigateur.
 * Utilisé par les tests et comme démonstration de reproductibilité.
 */
export function simulate(seed: number, ticks: number, dt = 1 / 30): MatchState {
  const state = createMatch(seed);
  const rng = createRng(mixSeed(seed ^ 0x5f3759df));

  for (let i = 0; i < ticks; i += 1) {
    stepMatch(state, dt, rng);
  }

  return state;
}

/** Minute de jeu affichable (la simulation n'a pas notion de mi-temps). */
export function matchMinute(state: MatchState): number {
  return Math.floor(state.time / 60);
}

export { TEAM_SIZE };
