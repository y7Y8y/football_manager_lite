/**
 * Pilotage du moteur de simulation.
 *
 * Cette classe ne sait PAS qu'un rendu existe : c'est la vue qui l'appelle.
 * Elle prouve, par l'usage, que le noyau est indépendant du graphisme.
 */

import { createRng, mixSeed } from './rng';
import { createMatch, stepMatch, type MatchState } from './simulation';

/** Pas de temps fixe de la simulation (60 Hz). */
export const FIXED_TIMESTEP = 1 / 60;

export class MatchRuntime {
  readonly seed: number;
  readonly state: MatchState;

  private readonly rng: () => number;

  constructor(seed: number) {
    this.seed = seed;
    this.state = createMatch(seed);
    this.rng = createRng(mixSeed(seed ^ 0x5f3759df));
  }

  /** Avance d'exactement `dt` secondes (appelé par la boucle de rendu). */
  advance(dt: number): void {
    stepMatch(this.state, dt, this.rng);
  }

  /** Repart de l'état initial avec la même graine. */
  reset(): void {
    const fresh = createMatch(this.seed);
    this.state.tick = 0;
    this.state.time = 0;
    this.state.ball.x = fresh.ball.x;
    this.state.ball.z = fresh.ball.z;
    this.state.ball.vx = fresh.ball.vx;
    this.state.ball.vz = fresh.ball.vz;
    this.state.players.forEach((player, index) => {
      const source = fresh.players[index];
      player.x = source.x;
      player.z = source.z;
      player.tx = source.tx;
      player.tz = source.tz;
      player.speed = source.speed;
    });
  }
}
