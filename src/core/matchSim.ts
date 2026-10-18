/**
 * Simulation d'un match de football, SANS RENDU.
 *
 * Critère de la phase 2 (doc 26) : « simuler une saison complète sans
 * interface ». Ce module ne connaît ni le DOM, ni Three.js, ni le réseau :
 * il tourne sous Node, ce qui permet de rejouer 240 matchs en une seconde.
 *
 * Choix de modélisation, et pourquoi :
 *
 *   1. La doc 48 décrit un tick de match spatial (perception → déplacements →
 *      collisions → ballon). Ce modèle est juste pour UN match regardé, mais
 *      il n'explique pas lisiblement pourquoi une équipe faible perd contre
 *      une équipe forte, et il coûte de l'ordre de 160 000 pas par match.
 *      Pour un championnat entier, on ne peut pas se le permettre.
 *   2. On simule donc à la MINUTE, et chaque minute porte des phases de jeu.
 *      Une phase = une attaque : progression par les passes, puis conclusion.
 *      C'est le modèle « utility AI + state machine » que la doc 42
 *      recommande pour un MVP.
 *   3. Les statistiques se calculent À PARTIR des événements (doc 40), jamais
 *      en parallèle. Un événement est de la donnée pure, sans logique
 *      d'affichage (doc 14).
 *
 * Déterminisme : un seul générateur par match, appelé dans un ordre fixe.
 * Même graine + mêmes entrées = mêmes événements, dans le même ordre.
 */

import { createRng, mixSeed } from './rng';
import { INJURY_TYPES } from '../data/names';
import { selectStartingXI, teamStrength, type TeamStrength } from './squad';
import type {
  Fixture,
  Injury,
  MatchEvent,
  MatchEventType,
  MatchStats,
  Player,
  World,
} from '../data/types';

/** Minutes réglementaires. Les arrêts de jeu sont ajoutés par tirage. */
const REGULAR_MINUTES = 90;
/** Phases de jeu par minute. Deux, pour approcher le nombre réel d'attaques. */
const PHASES_PER_MINUTE = 2;

/** Avantage du terrain : faible, mesurable, jamais décisif. */
const HOME_EDGE = 0.03;

/** Bornes du modèle, pour rester dans des ordres de grandeur crédibles. */
const MODEL = {
  /** Probabilité qu'une passe aboutisse, avant ajustement par la pression. */
  passBase: 0.82,
  /** Un point de capacité d'écart vaut cette part de réussite en plus. */
  passEdge: 0.004,
  /** Probabilité de convertir une phase aboutie en tir. */
  shootChance: 0.24,
  /** Part de tirs cadrés. */
  onTarget: 0.38,
  /**
   * Probabilité d'arrêt du gardien sur un tir cadré, avant ajustement.
   * Calé pour viser ~2,7 buts par match : un championnat réel tourne entre
   * 2,5 et 2,8.
   */
  saveBase: 0.68,
  /** Probabilité de corner quand un tir n'est pas cadré. */
  cornerChance: 0.22,
  /** Probabilité de faute quand la phase est menée à son terme. */
  foulChance: 0.10,
  /** Probabilité de faute quand le ballon est perdu. */
  foulOnTurnover: 0.12,
  /** Probabilité de hors-jeu par phase. */
  offsideChance: 0.05,
  /** Probabilité de carton jaune quand une faute est sifflée. */
  yellowChance: 0.22,
  /** Probabilité de carton rouge direct quand une faute est sifflée. */
  redChance: 0.006,
  /**
   * Probabilité de penalty quand une faute est sifflée. Calé sur environ
   * 0,35 penalty par match, tous matchs confondus.
   */
  penaltyChance: 0.015,
  /** Taux de conversion d'un penalty. */
  penaltyScore: 0.76,
  /**
   * Risque de blessure par minute et par équipe. Cale sur environ 0,12
   * blessure par équipe et par match, ce qui correspond à l'ordre de grandeur
   * observé dans un championnat.
   */
  injuryRisk: 0.0013,
  /** Pénalité de force par joueur exclu. */
  sendOffPenalty: 0.12,
  /** Un joueur blessé en cours de match laisse sa place. */
  substitutionWindow: [55, 80] as const,
} as const;

/** Position du but adverse, en mètres depuis le coup d'envoi. */
const GOAL_X = 52.5;

export interface MatchInput {
  world: World;
  fixture: Fixture;
  /** Premier identifiant d'événement disponible ; les suivants s'enchaînent. */
  firstEventId: number;
}

export interface MatchResult {
  fixtureId: number;
  homeClubId: number;
  awayClubId: number;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  stats: MatchStats[];
  /** Blessures survenues pendant le match, à verser dans `world.injuries`. */
  injuries: NewInjury[];
}

export interface NewInjury {
  playerId: number;
  type: string;
  severity: Injury['severity'];
  days: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Applique l'avantage du terrain à une force d'équipe. */
function withHomeEdge(strength: TeamStrength): TeamStrength {
  return {
    ...strength,
    attack: Math.min(100, strength.attack * (1 + HOME_EDGE)),
    defence: Math.min(100, strength.defence * (1 + HOME_EDGE)),
  };
}

/**
 * xG simplifié (doc 40) : dépend de la distance et de l'angle, pas du joueur.
 * La formule est la nôtre, à calibrer — la doc 26 nomme « formules copiées »
 * comme risque et demande de concevoir et tester les siennes.
 */
export function expectedGoals(x: number, y: number, penalty = false): number {
  if (penalty) return MODEL.penaltyScore;
  const distance = Math.max(4, Math.hypot(x, y));
  // La probabilité chute vite avec la distance et avec l'angle.
  const angle = Math.abs(Math.atan2(Math.abs(y), Math.max(1, x)));
  return clamp01((11 / (distance * distance)) * (1 - angle * 0.45));
}

/** Arrondi stable, pour que les métadonnées ne varient pas d'une machine à l'autre. */
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export function simulateMatch(input: MatchInput): MatchResult {
  const { world, fixture } = input;

  const home = world.clubs.find(c => c.id === fixture.homeClubId);
  const away = world.clubs.find(c => c.id === fixture.awayClubId);
  if (!home || !away) {
    throw new Error(
      `Match ${fixture.id} : club introuvable (${fixture.homeClubId} / ${fixture.awayClubId})`,
    );
  }

  // L'avantage du terrain s'applique à l'attaque comme à la défense, pas
  // seulement à la possession : c'est ce qui le rend mesurable dans les
  // résultats sans rendre le match joué d'avance.
  const homeStrength = withHomeEdge(teamStrength(world, home.id));
  const awayStrength = teamStrength(world, away.id);
  const homeXI = selectStartingXI(world, home.id);
  const awayXI = selectStartingXI(world, away.id);

  // Un générateur par match, dérivé de la graine du monde et de l'identifiant
  // du match : deux matchs ne partagent jamais leur suite de tirages.
  const rng = createRng(mixSeed(world.seed ^ mixSeed(fixture.id * 2654435761)));

  const events: MatchEvent[] = [];
  const injuries: NewInjury[] = [];

  let eventId = input.firstEventId;
  let sequence = 0;

  const push = (
    minute: number,
    type: MatchEventType,
    teamId: number,
    playerId: number | null,
    secondaryPlayerId: number | null,
    x: number,
    y: number,
    outcome: string | null,
    metadata: Record<string, number | string> | null,
  ): void => {
    sequence += 1;
    // La séquence départage deux événements à la même minute (doc 48).
    const full: Record<string, number | string> = { sequence };
    if (metadata) Object.assign(full, metadata);

    events.push({
      id: eventId,
      matchId: fixture.id,
      minute,
      second: 0,
      type,
      teamId,
      playerId,
      secondaryPlayerId,
      x: round3(x),
      y: round3(y),
      outcome,
      metadata: full,
    });
    eventId += 1;
  };

  const score = { home: 0, away: 0 };
  const cards = { home: 0, away: 0 };
  const sentOff = { home: 0, away: 0 };
  const injuredOut = new Set<number>();
  const substitutions = { home: 0, away: 0 };

  /** Tire un joueur au sort parmi les titulaires correspondant au poste. */
  const pickFrom = (xi: Player[], positions: readonly Player['position'][]): Player | null => {
    const pool = xi.filter(p => positions.includes(p.position) && !injuredOut.has(p.id));
    if (pool.length === 0) return null;
    return pool[Math.floor(rng() * pool.length) % pool.length];
  };

  /** Force affichée, minorée par les exclusions. */
  const effective = (base: TeamStrength, isHome: boolean): TeamStrength => {
    const off = isHome ? sentOff.home : sentOff.away;
    if (off === 0) return base;
    const factor = 1 - MODEL.sendOffPenalty * off;
    return { ...base, attack: base.attack * factor, defence: base.defence * factor };
  };

  push(0, 'kickoff', home.id, null, null, 0, 0, null, null);

  /**
   * Une phase de jeu : l'équipe qui attaque tente de marquer.
   * Tout tirage aléatoire passe par `rng`, dans cet ordre fixe.
   */
  const runPhase = (minute: number, isHomeAttacking: boolean): void => {
    const att = effective(isHomeAttacking ? homeStrength : awayStrength, isHomeAttacking);
    const def = effective(isHomeAttacking ? awayStrength : homeStrength, !isHomeAttacking);
    const attId = isHomeAttacking ? home.id : away.id;
    const defId = isHomeAttacking ? away.id : home.id;
    const attXI = isHomeAttacking ? homeXI : awayXI;
    const defXI = isHomeAttacking ? awayXI : homeXI;

    // --- progression par les passes ---
    const passes = 3 + Math.floor(rng() * 4);
    let progress = 0;
    let assister: Player | null = null;

    for (let i = 0; i < passes; i += 1) {
      const chance = clamp01(
        MODEL.passBase + (att.midfield - def.midfield) * MODEL.passEdge,
      );
      const passer = pickFrom(attXI, ['MC', 'DM', 'AM', 'ML', 'MR', 'DL', 'DR', 'DC']);

      if (rng() < chance) {
        progress += 1;
        if (passer) assister = passer;
        push(minute, 'pass', attId, passer ? passer.id : null, null, progress * 12, (rng() * 2 - 1) * 20, 'success', null);
      } else {
        // Ballon perdu : la phase s'arrête là, souvent sur une faute.
        push(minute, 'pass', attId, passer ? passer.id : null, null, progress * 12, 0, 'fail', null);
        if (rng() < MODEL.foulOnTurnover) {
          commitFoul(minute, att, def, attId, defId, attXI, defXI, isHomeAttacking);
        }
        return;
      }
    }

    // --- phase aboutie : tir, coup de pied arrêté, ou rien ---
    if (rng() >= MODEL.shootChance) {
      // Hors-jeu ou faute, rarement.
      if (rng() < MODEL.offsideChance) {
        push(minute, 'offside', attId, null, null, 30, (rng() * 2 - 1) * 20, null, null);
      } else if (rng() < MODEL.foulChance) {
        commitFoul(minute, att, def, attId, defId, attXI, defXI, isHomeAttacking);
      }
      return;
    }

    const shooter = pickFrom(attXI, ['ST', 'AM', 'WL', 'WR', 'MC']) ?? pickFrom(attXI, ['ST', 'AM', 'WL', 'WR', 'MC', 'MC', 'DM']);
    const y = (rng() * 2 - 1) * 24;
    const x = GOAL_X - 4 - rng() * 26;
    const xg = expectedGoals(GOAL_X - x, y);
    const onTarget = rng() < MODEL.onTarget + (att.attack - def.defence) * 0.002;

    push(
      minute,
      'shot',
      attId,
      shooter ? shooter.id : null,
      null,
      x,
      y,
      onTarget ? 'on_target' : 'off_target',
      { xg: round3(xg) },
    );

    if (!onTarget) {
      if (rng() < MODEL.cornerChance) {
        push(minute, 'corner', attId, shooter ? shooter.id : null, null, x, y, null, null);
      }
      return;
    }

    // Tir cadré : arrêt du gardien ou but.
    const keeper = pickFrom(defXI, ['GK']);
    const saveChance = clamp01(
      MODEL.saveBase + (def.defence - att.attack) * 0.004 - xg * 0.8,
    );

    if (rng() < saveChance) {
      push(minute, 'save', defId, keeper ? keeper.id : null, shooter ? shooter.id : null, x, y, 'saved', null);
      return;
    }

    push(minute, 'goal', attId, shooter ? shooter.id : null, assister ? assister.id : null, x, y, 'goal', { xg: round3(xg) });
    if (isHomeAttacking) score.home += 1;
    else score.away += 1;
  };

  /** Faute commise par l'équipe qui défend. */
  const commitFoul = (
    minute: number,
    _att: TeamStrength,
    def: TeamStrength,
    attId: number,
    defId: number,
    attXI: Player[],
    defXI: Player[],
    isHomeAttacking: boolean,
  ): void => {
    const fouled = pickFrom(attXI, ['ST', 'AM', 'WL', 'WR', 'MC']);
    const offender = pickFrom(defXI, ['DC', 'DL', 'DR', 'DM']);

    push(
      minute,
      'foul',
      defId,
      offender ? offender.id : null,
      fouled ? fouled.id : null,
      35,
      (rng() * 2 - 1) * 20,
      null,
      null,
    );

    // Carton.
    if (rng() < MODEL.redChance) {
      push(minute, 'red_card', defId, offender ? offender.id : null, null, 35, 0, null, null);
      if (isHomeAttacking) sentOff.away += 1;
      else sentOff.home += 1;
    } else if (rng() < MODEL.yellowChance) {
      push(minute, 'yellow_card', defId, offender ? offender.id : null, null, 35, 0, null, null);
      if (isHomeAttacking) cards.away += 1;
      else cards.home += 1;
    }

    // Penalty : faute dans la surface, conversion ou arrêt.
    if (rng() < MODEL.penaltyChance) {
      const taker = pickFrom(attXI, ['ST', 'AM', 'MC']);
      const scored = rng() < MODEL.penaltyScore;
      push(
        minute,
        scored ? 'penalty_goal' : 'penalty',
        attId,
        taker ? taker.id : null,
        null,
        GOAL_X - 11,
        0,
        scored ? 'goal' : 'saved',
        { xg: MODEL.penaltyScore },
      );
      if (scored) {
        if (isHomeAttacking) score.home += 1;
        else score.away += 1;
      }
    }

    void def;
  };

  /** Blessure en cours de match : le joueur sort, il est versé au médical. */
  const rollInjury = (minute: number, isHome: boolean): void => {
    const xi = isHome ? homeXI : awayXI;
    const clubId = isHome ? home.id : away.id;
    const candidates = xi.filter(p => !injuredOut.has(p.id));
    if (candidates.length === 0) return;

    const victim = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    // La condition physique du joueur module le risque.
    const risk = MODEL.injuryRisk * (1.6 - victim.fitness / 100);
    if (rng() > risk) return;

    const days = 3 + Math.floor(rng() * 25);
    const severity: Injury['severity'] = days > 20 ? 'serious' : days > 9 ? 'moderate' : 'minor';

    push(
      minute,
      'injury',
      clubId,
      victim.id,
      null,
      20,
      (rng() * 2 - 1) * 15,
      null,
      { days, severity },
    );

    injuries.push({
      playerId: victim.id,
      type: INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length) % INJURY_TYPES.length],
      severity,
      days,
    });
    injuredOut.add(victim.id);
    substitutions[isHome ? 'home' : 'away'] += 1;
  };

  /** Remplacement tactique, en fin de match. */
  const rollSubstitution = (minute: number, isHome: boolean): void => {
    const clubId = isHome ? home.id : away.id;
    const xi = isHome ? homeXI : awayXI;
    if (substitutions[isHome ? 'home' : 'away'] >= 3) return;

    const tired = xi
      .filter(p => !injuredOut.has(p.id) && p.position !== 'GK')
      .sort((a, b) => a.fitness - b.fitness)[0];
    if (!tired) return;

    push(minute, 'substitution', clubId, tired.id, null, 0, 0, 'out', { minute });
    substitutions[isHome ? 'home' : 'away'] += 1;
  };

  /* --------------------------------------------------------------- déroulé */

  const addedTime = 1 + Math.floor(rng() * 5);
  const [subFrom, subTo] = MODEL.substitutionWindow;

  for (let minute = 1; minute <= REGULAR_MINUTES + addedTime; minute += 1) {
    if (minute === 46) {
      push(45, 'half_time', home.id, null, null, 0, 0, null, null);
    }

    for (let phase = 0; phase < PHASES_PER_MINUTE; phase += 1) {
      // Qui attaque ? Le milieu fait la différence, avec un avantage du
      // terrain pour le locataire.
      const homeShare = clamp01(
        0.5 + (homeStrength.midfield - awayStrength.midfield) * 0.006 + HOME_EDGE,
      );
      runPhase(minute, rng() < homeShare);
    }

    rollInjury(minute, true);
    rollInjury(minute, false);

    if (minute >= subFrom && minute <= subTo && rng() < 0.05) {
      rollSubstitution(minute, true);
      rollSubstitution(minute, false);
    }
  }

  // Le coup de sifflet final tombe APRÈS les arrêts de jeu, sinon le dernier
  // événement du match ne serait pas la fin du match.
  push(REGULAR_MINUTES + addedTime, 'full_time', home.id, null, null, 0, 0, null, {
    homeGoals: score.home,
    awayGoals: score.away,
  });

  return {
    fixtureId: fixture.id,
    homeClubId: home.id,
    awayClubId: away.id,
    homeGoals: score.home,
    awayGoals: score.away,
    events,
    stats: computeStats(events, fixture.id, home.id, away.id),
    injuries,
  };
}

/**
 * Statistiques d'un match, calculées UNIQUEMENT à partir des événements
 * (doc 40). Recalculables depuis zéro à tout moment.
 */
export function computeStats(
  events: MatchEvent[],
  matchId: number,
  homeClubId: number,
  awayClubId: number,
): MatchStats[] {
  const rows: MatchStats[] = [];

  for (const clubId of [homeClubId, awayClubId]) {
    const own = events.filter(e => e.teamId === clubId);
    const conceded = events.filter(e => e.teamId !== clubId);

    const passes = own.filter(e => e.type === 'pass');
    const completed = passes.filter(e => e.outcome === 'success');
    const shots = own.filter(e => e.type === 'shot');

    const ownPasses = passes.length;
    const totalPasses = ownPasses + conceded.filter(e => e.type === 'pass').length;

    rows.push({
      matchId,
      teamId: clubId,
      possession: totalPasses > 0 ? Math.round((ownPasses / totalPasses) * 100) : 50,
      shots: shots.length,
      shotsOnTarget: shots.filter(e => e.outcome === 'on_target').length,
      xg: round3(shots.reduce((sum, e) => sum + Number(e.metadata?.xg ?? 0), 0)),
      passes: ownPasses,
      passAccuracy: passes.length > 0 ? Math.round((completed.length / passes.length) * 100) : 0,
      corners: own.filter(e => e.type === 'corner').length,
      fouls: own.filter(e => e.type === 'foul').length,
      yellows: own.filter(e => e.type === 'yellow_card').length,
      reds: own.filter(e => e.type === 'red_card').length,
    });
  }

  return rows;
}
