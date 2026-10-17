/**
 * Tests du noyau de simulation.
 *
 * Ils tournent sous Node, sans navigateur ni GPU : c'est exactement ce qui
 * démontre que la logique de jeu est indépendante du rendu.
 */

import { describe, expect, it } from 'vitest';
import {
  countPlayers,
  createMatch,
  fingerprint,
  matchMinute,
  simulate,
  stepMatch,
  type MatchState,
} from './simulation';
import { createRng, mixSeed } from './rng';
import { PITCH_BOUNDS, PLAYER_COUNT, TEAM_SIZE } from './pitch';

const SEED_A = 20261017;
const SEED_B = 987654321;
/** 90 minutes de match à 30 pas par seconde. */
const TICKS_90_MIN = 30 * 60 * 90;

function run(seed: number, ticks: number): MatchState {
  const state = createMatch(seed);
  const rng = createRng(mixSeed(seed ^ 0x5f3759df));
  for (let i = 0; i < ticks; i += 1) {
    stepMatch(state, 1 / 30, rng);
  }
  return state;
}

describe('effectif', () => {
  it('place 22 joueurs répartis en deux équipes de 11', () => {
    const counts = countPlayers(createMatch(SEED_A));

    expect(counts.total).toBe(PLAYER_COUNT);
    expect(counts.total).toBe(22);
    expect(counts.home).toBe(TEAM_SIZE);
    expect(counts.away).toBe(TEAM_SIZE);
  });

  it('désigne un gardien par équipe', () => {
    const { players } = createMatch(SEED_A);
    const goalkeepers = players.filter((player) => player.role === 'GK');

    expect(goalkeepers).toHaveLength(2);
    expect(goalkeepers.map((player) => player.team)).toEqual([0, 1]);
  });
});

describe('déterminisme', () => {
  it('produit un état identique pour une même graine', () => {
    const first = fingerprint(run(SEED_A, 5000));
    const second = fingerprint(run(SEED_A, 5000));

    expect(second).toBe(first);
  });

  it('produit des trajectoires différentes pour deux graines', () => {
    const first = fingerprint(run(SEED_A, 5000));
    const second = fingerprint(run(SEED_B, 5000));

    expect(second).not.toBe(first);
  });

  it('reste reproductible via simulate() et matchMinute()', () => {
    const state = simulate(SEED_A, TICKS_90_MIN);

    expect(state.tick).toBe(TICKS_90_MIN);
    expect(matchMinute(state)).toBe(90);
    expect(fingerprint(state)).toBe(fingerprint(simulate(SEED_A, TICKS_90_MIN)));
  });
});

describe('bornes du terrain', () => {
  it('garde les 22 joueurs et le ballon à l’intérieur des lignes', () => {
    const state = run(SEED_A, 5000);
    const { minX, maxX, minZ, maxZ } = PITCH_BOUNDS;

    for (const player of state.players) {
      expect(player.x).toBeGreaterThanOrEqual(minX);
      expect(player.x).toBeLessThanOrEqual(maxX);
      expect(player.z).toBeGreaterThanOrEqual(minZ);
      expect(player.z).toBeLessThanOrEqual(maxZ);
    }

    expect(state.ball.x).toBeGreaterThanOrEqual(minX);
    expect(state.ball.x).toBeLessThanOrEqual(maxX);
    expect(state.ball.z).toBeGreaterThanOrEqual(minZ);
    expect(state.ball.z).toBeLessThanOrEqual(maxZ);
  });

  it('ne produit aucune valeur non finie', () => {
    const state = run(SEED_A, 5000);

    for (const player of state.players) {
      expect(Number.isFinite(player.x)).toBe(true);
      expect(Number.isFinite(player.z)).toBe(true);
    }
    expect(Number.isFinite(state.ball.x)).toBe(true);
    expect(Number.isFinite(state.ball.vz)).toBe(true);
  });
});

describe('mouvement', () => {
  it('fait circuler le ballon (il quitte le point de coup d’envoi)', () => {
    const state = run(SEED_A, 600);
    const distance = Math.hypot(state.ball.x, state.ball.z);

    expect(distance).toBeGreaterThan(5);
  });

  it('déplace les joueurs de leur position initiale', () => {
    const initial = createMatch(SEED_A);
    const state = run(SEED_A, 600);

    const moved = state.players.filter(
      (player, index) =>
        Math.abs(player.x - initial.players[index].x) > 0.5 ||
        Math.abs(player.z - initial.players[index].z) > 0.5,
    );

    expect(moved.length).toBeGreaterThan(10);
  });
});
