/**
 * Boucle de tick du monde — contrat de la doc 48 « Ordre du tick ».
 *
 * Un tick est une transaction : on lit un état, on applique les systèmes dans
 * un ordre fixe, on produit un nouvel état. L'ordre ci-dessous est celui de la
 * doc 48, à la lettre :
 *
 *   1 Horloge · 2 Calendrier · 3 IA des clubs · 4 Contrats · 5 Entraînement
 *   6 Médical · 7 Tactique · 8 Préparation · 9 Match · 10 Statistiques
 *   11 Presse · 12 Moral · 13 Finances · 14 Sauvegarde
 *
 * Trois règles de déterminisme, héritées de la doc 48 :
 *   - aucun accès au temps réel (`Date.now`, `performance.now`) ;
 *   - aucune itération sur un dictionnaire non ordonné ;
 *   - aucun aléatoire non seedé — tout passe par `ctx.rng`.
 *
 * Un tick monde = un jour. Le tick de match (une minute) vit à l'intérieur du
 * système 9 et arrive avec M2.
 */

import type { World, WorldLogEntry } from '../data/types';
import { addDays } from '../data/generate';

export interface TickContext {
  /** Générateur pseudo-aléatoire déterministe, propre au tick courant. */
  readonly rng: () => number;
  readonly seed: number;
}

export type TickSystem = (world: World, ctx: TickContext) => void;

/** Jalon qui implémente réellement le système. */
export type Milestone = 1 | 2 | 3 | 6;

export interface SystemSpec {
  readonly name: string;
  readonly milestone: Milestone;
  readonly run: TickSystem;
  /** Vrai quand le système est encore un emplacement réservé. */
  readonly reserved: boolean;
}

/* ------------------------------------------------------------------ 1 à 14 */

const clock: TickSystem = world => {
  world.date = addDays(world.date, 1);
};

const calendar: TickSystem = world => {
  // Les matchs du jour sont signalés au système 9. On ne fait que repérer.
  for (const fixture of world.fixtures) {
    if (fixture.date === world.date && fixture.status === 'scheduled') {
      fixture.status = 'scheduled'; // réservé : M2 joue le match ici
    }
  }
};

const clubAi: TickSystem = () => {
  // Réservé M3 : décisions de transfert et de effectif des autres clubs.
};

const contracts: TickSystem = world => {
  // Réservé partiellement : détection des expirations proches.
  for (const contract of world.contracts) {
    if (contract.end === world.date) {
      world.log.push({
        tick: world.tick,
        date: world.date,
        system: 'Contrats',
        message: `contrat ${contract.id} expiré`,
      });
    }
  }
};

const training: TickSystem = () => {
  // Réservé M3 : progression et fatigue issues du programme d'entraînement.
};

const medical: TickSystem = (world, ctx) => {
  // Retours de blessure : un joueur dont la date de retour est atteinte
  // réintègre le groupe. L'aléa décide d'un retard éventuel, de façon seedée.
  for (const injury of world.injuries) {
    if (injury.actualReturn === null && injury.expectedReturn <= world.date) {
      const late = ctx.rng() < 0.2;
      injury.actualReturn = late ? addDays(world.date, 7) : world.date;
    }
  }
};

const tactics: TickSystem = () => {
  // Réservé M3 : familiarité tactique et consignes.
};

const preparation: TickSystem = () => {
  // Réservé M3 : compositions et convocations.
};

const match: TickSystem = () => {
  // Réservé M2 : simulation des matchs du jour, événements, score.
};

const stats: TickSystem = () => {
  // Réservé M2 : agrégation des statistiques de match.
};

const press: TickSystem = () => {
  // Réservé M6 : conférences de presse et effets sur le moral.
};

const morale: TickSystem = (world, ctx) => {
  // Dérive lente du moral, bornée à [0, 100]. Les résultats de match (M2)
  // viendront la ponctuer de mouvements plus nets.
  for (const player of world.players) {
    const drift = Math.floor(ctx.rng() * 5) - 2; // -2..+2
    player.morale = Math.max(0, Math.min(100, player.morale + drift));
  }
};

const finances: TickSystem = world => {
  // Paie hebdomadaire, prélevée sur le budget salarial du club.
  // Le tick 0 est le premier jour de la saison : on n'y paie pas.
  if (world.tick === 0 || world.tick % 7 !== 0) return;
  for (const finance of world.finances) {
    const weekly = world.contracts
      .filter(c => c.clubId === finance.clubId)
      .reduce((sum, c) => sum + c.wage, 0);
    finance.wageBudget = Math.max(0, finance.wageBudget - weekly);
  }
};

const save: TickSystem = () => {
  // Réservé M1 (second volet) : le snapshot est pris explicitement par
  // `saveWorld`, pas à chaque tick — un tick reste sous le budget de 7 ms.
};

export const TICK_ORDER: readonly SystemSpec[] = [
  { name: 'Horloge',        milestone: 1, run: clock,      reserved: false },
  { name: 'Calendrier',     milestone: 1, run: calendar,   reserved: true  },
  { name: 'IA des clubs',   milestone: 3, run: clubAi,     reserved: true  },
  { name: 'Contrats',       milestone: 1, run: contracts,  reserved: true  },
  { name: 'Entraînement',   milestone: 3, run: training,   reserved: true  },
  { name: 'Médical',        milestone: 1, run: medical,    reserved: false },
  { name: 'Tactique',       milestone: 3, run: tactics,    reserved: true  },
  { name: 'Préparation',    milestone: 3, run: preparation,reserved: true  },
  { name: 'Match',          milestone: 2, run: match,      reserved: true  },
  { name: 'Statistiques',   milestone: 2, run: stats,      reserved: true  },
  { name: 'Presse',         milestone: 6, run: press,      reserved: true  },
  { name: 'Moral',          milestone: 1, run: morale,     reserved: false },
  { name: 'Finances',       milestone: 1, run: finances,   reserved: false },
  { name: 'Sauvegarde',     milestone: 1, run: save,       reserved: true  },
];

/** Contexte de tick neuf, dérivé de la graine du monde. */
export function createTickContext(seed: number, tick: number): TickContext {
  // La graine du tick dépend du numéro de tick : rejouer le même tick
  // redonne la même séquence, mais deux ticks différents divergent.
  return { rng: createRngFor(seed, tick), seed };
}

/**
 * Dérive un RNG du couple (graine du monde, numéro de tick).
 * Implémenté localement pour éviter une dépendance circulaire avec rng.ts.
 */
function createRngFor(seed: number, tick: number): () => number {
  let a = (seed ^ Math.imul(tick + 1, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Avance le monde d'un tick, en appliquant les 14 systèmes dans l'ordre.
 * Retourne les entrées de journal produites par ce tick.
 */
export function runTick(world: World): WorldLogEntry[] {
  const start = world.log.length;
  const ctx = createTickContext(world.seed, world.tick);

  for (const system of TICK_ORDER) {
    const before = world.log.length;
    system.run(world, ctx);
    if (world.log.length === before) {
      // Journalisation uniforme : chaque système laisse une trace, ce qui rend
      // l'ordre d'exécution observable et testable.
      world.log.push({
        tick: world.tick,
        date: world.date,
        system: system.name,
        message: system.reserved ? 'réservé' : 'appliqué',
      });
    }
  }

  world.tick += 1;
  return world.log.slice(start);
}

/** Avance de `days` ticks. */
export function runTicks(world: World, days: number): void {
  for (let i = 0; i < days; i++) runTick(world);
}

/** Noms des systèmes, dans l'ordre. Sert de référence aux tests. */
export function tickOrderNames(): readonly string[] {
  return TICK_ORDER.map(s => s.name);
}

/** Nombre de systèmes encore réservés, par jalon. */
export function reservedByMilestone(): Record<Milestone, number> {
  const out: Record<Milestone, number> = { 1: 0, 2: 0, 3: 0, 6: 0 };
  for (const s of TICK_ORDER) out[s.milestone] += 1;
  return out;
}
