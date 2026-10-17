/**
 * Générateur de monde fictif — Phase 1 de la doc 26.
 *
 * Produit un monde complet et reproductible : un pays, une ligue, 16 clubs,
 * environ 500 joueurs, le staff, les contrats, la tactique, les finances,
 * les maillots et un calendrier aller-retour de 30 journées.
 *
 * Déterminisme : aucune utilisation de `Math.random`, `Date.now` ou
 * `performance.now`. Toute l'aléa vient du `createRng(seed)` du noyau.
 * Les identifiants sont attribués par un compteur monotone, dans un ordre
 * fixe, pour que deux exécutions produisent des mondes identiques.
 */

import { createRng, mixSeed } from '../core/rng';
import {
  SCHEMA_VERSION,
  type Club,
  type ClubFinances,
  type Competition,
  type Contract,
  type Country,
  type Fixture,
  type Injury,
  type Kit,
  type Lineup,
  type MatchEvent,
  type MatchStats,
  type Player,
  type PlayerCondition,
  type Position,
  type Season,
  type Staff,
  type StaffRole,
  type Tactic,
  type TacticSlot,
  type TransferOffer,
  type World,
} from './types';
import {
  CITIES,
  CLUB_PREFIXES,
  CLUB_SUFFIXES,
  FIRST_NAMES,
  INJURY_TYPES,
  LAST_NAMES,
  STAFF_NAMES,
  STADIUMS,
} from './names';

export interface GenerateOptions {
  seed: number;
  /** Nombre de clubs. La doc 26 demande 10 à 20. */
  clubCount?: number;
  /** Saison de départ. */
  startYear?: number;
}

/* ------------------------------------------------------------------ helpers */

/** Tire un élément d'une liste, déterministe. */
function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Entier dans [min, max] inclus. */
function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Ajoute `days` jours à une date ISO et renvoie une date ISO. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------- composition */

/** Répartition d'un effectif de 31 joueurs, par poste. */
const SQUAD_SHAPE: readonly { position: Position; count: number }[] = [
  { position: 'GK', count: 3 },
  { position: 'DL', count: 2 },
  { position: 'DC', count: 4 },
  { position: 'DR', count: 2 },
  { position: 'DM', count: 2 },
  { position: 'MC', count: 4 },
  { position: 'ML', count: 1 },
  { position: 'MR', count: 1 },
  { position: 'AM', count: 2 },
  { position: 'ST', count: 3 },
  { position: 'WL', count: 2 },
  { position: 'WR', count: 2 },
];

const FORMATIONS: readonly string[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-1-4-1'];
const MENTALITIES: readonly Tactic['mentality'][] = ['defensive', 'balanced', 'positive', 'attacking'];
const KIT_COLORS: readonly string[] = [
  '#7C2D3A', '#1E4E8C', '#1E6E45', '#C83D45', '#2A5C8A',
  '#4A4854', '#E4B21F', '#F2EEE6', '#8C2A5B', '#1F5F5B',
];
const KIT_PATTERNS: readonly Kit['pattern'][] = ['solid', 'stripes', 'sash', 'hoops'];

/* ---------------------------------------------------------------- génération */

export function generateWorld(options: GenerateOptions): World {
  const seed = options.seed >>> 0;
  const clubCount = Math.min(20, Math.max(10, options.clubCount ?? 16));
  const startYear = options.startYear ?? 2026;

  const rng = createRng(mixSeed(seed));
  const nextId = (() => { let n = 0; return () => ++n; })();

  /* ---- référentiel ---- */
  const country: Country = {
    id: nextId(),
    name: 'République de Côté-Large',
    code: 'RCL',
    reputation: 62,
  };

  const competition: Competition = {
    id: nextId(),
    countryId: country.id,
    name: 'Championnat de Côté-Large',
    type: 'league',
    level: 1,
    reputation: 58,
    rules: {
      maxSquad: 25,
      foreignLimit: 12,
      homegrownMin: 8,
      loanLimit: 4,
      ffpEnabled: true,
    },
  };

  const startDate = `${startYear}-08-08`;
  const season: Season = {
    id: nextId(),
    competitionId: competition.id,
    year: startYear,
    startDate,
    endDate: `${startYear + 1}-05-30`,
  };

  /* ---- clubs ---- */
  const usedNames = new Set<string>();
  const clubs: Club[] = [];
  for (let i = 0; i < clubCount; i++) {
    let name: string;
    do {
      name = `${pick(rng, CLUB_PREFIXES)} ${pick(rng, CLUB_SUFFIXES)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const city = CITIES[i % CITIES.length];
    clubs.push({
      id: nextId(),
      name,
      shortName: name.split(' ')[0].slice(0, 3).toUpperCase(),
      countryId: country.id,
      city,
      reputation: int(rng, 25, 95),
      stadium: pick(rng, STADIUMS),
      budgetTransfer: int(rng, 500_000, 40_000_000) * 100,
      budgetWage: int(rng, 200_000, 3_000_000) * 100,
      primaryColor: pick(rng, KIT_COLORS),
      secondaryColor: pick(rng, KIT_COLORS),
    });
  }

  /* ---- joueurs, contrats, conditions ---- */
  const players: Player[] = [];
  const contracts: Contract[] = [];
  const conditions: PlayerCondition[] = [];

  for (const club of clubs) {
    for (const slot of SQUAD_SHAPE) {
      for (let k = 0; k < slot.count; k++) {
        const firstName = pick(rng, FIRST_NAMES);
        const lastName = pick(rng, LAST_NAMES);
        const birthYear = int(rng, startYear - 38, startYear - 17);
        const age = startYear - birthYear;

        // La capacité suit une courbe d'âge : montée jusqu'à 27 ans, déclin après.
        const peak = int(rng, 55, 92);
        const ageFactor = age <= 27 ? 1 : 1 - (age - 27) * 0.045;
        const ca = Math.max(20, Math.min(99, Math.round(peak * Math.max(0.55, ageFactor))));
        const pa = Math.max(ca, Math.min(99, ca + int(rng, 0, 25)));

        const value = Math.round((ca * ca * 310 + int(rng, 0, 400_000)) / 100) * 100;
        const wage = Math.round((ca * 1450 + int(rng, 0, 60_000)) / 100) * 100;

        const player: Player = {
          id: nextId(),
          firstName,
          lastName,
          birthYear,
          nationalityId: country.id,
          position: slot.position,
          ca,
          pa,
          value,
          clubId: club.id,
          squadStatus: k === 0 ? 'key' : k < 4 ? 'regular' : k < 9 ? 'squad' : 'youth',
          morale: int(rng, 45, 95),
          fitness: int(rng, 70, 100),
          sharpness: int(rng, 55, 95),
        };
        players.push(player);

        const start = addDays(startDate, -int(rng, 30, 1500));
        const end = `${startYear + int(rng, 1, 5)}-06-30`;
        contracts.push({
          id: nextId(),
          playerId: player.id,
          clubId: club.id,
          start,
          end,
          wage,
          releaseClause: rng() < 0.25 ? value * int(rng, 2, 4) : 0,
          optionYear: rng() < 0.15,
          squadStatus: player.squadStatus,
        });

        conditions.push({
          playerId: player.id,
          fitness: player.fitness,
          sharpness: player.sharpness,
          fatigue: int(rng, 0, 35),
        });
      }
    }
  }

  /* ---- staff ---- */
  const staff: Staff[] = [];
  const ROLES: readonly StaffRole[] = ['manager', 'assistant', 'coach', 'fitness', 'goalkeeping', 'physio', 'scout', 'analyst'];
  for (const club of clubs) {
    for (const role of ROLES) {
      staff.push({
        id: nextId(),
        name: pick(rng, STAFF_NAMES),
        role,
        reputation: int(rng, 30, 95),
        clubId: club.id,
        contractEnd: `${startYear + int(rng, 1, 3)}-06-30`,
      });
    }
  }

  /* ---- calendrier aller-retour (round-robin) ---- */
  const fixtures: Fixture[] = buildDoubleRoundRobin(clubs, season, startDate, nextId);

  /* ---- tactique ---- */
  const tactics: Tactic[] = [];
  const tacticSlots: TacticSlot[] = [];
  const STARTING_XI: readonly Position[] = ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'AM', 'ST', 'ST'];

  for (const club of clubs) {
    const tactic: Tactic = {
      id: nextId(),
      clubId: club.id,
      name: 'Schéma principal',
      formation: pick(rng, FORMATIONS),
      mentality: pick(rng, MENTALITIES),
      pressing: int(rng, 20, 90),
      tempo: int(rng, 20, 90),
      width: int(rng, 30, 85),
    };
    tactics.push(tactic);

    const eligible = players.filter(p => p.clubId === club.id);
    const used = new Set<number>();
    for (const position of STARTING_XI) {
      const candidate = eligible.find(p => p.position === position && !used.has(p.id));
      if (candidate) used.add(candidate.id);
      tacticSlots.push({
        id: nextId(),
        tacticId: tactic.id,
        position,
        role: position,
        duty: 'support',
        playerId: candidate ? candidate.id : null,
      });
    }
  }

  /* ---- finances ---- */
  const finances: ClubFinances[] = clubs.map(club => {
    const wageBill = players
      .filter(p => p.clubId === club.id)
      .reduce((sum, p) => sum + (contracts.find(c => c.playerId === p.id)?.wage ?? 0), 0);
    return {
      clubId: club.id,
      season: startYear,
      revenue: int(rng, 8_000_000, 180_000_000) * 100,
      costs: wageBill * 52 + int(rng, 2_000_000, 30_000_000) * 100,
      transferBudget: club.budgetTransfer,
      wageBudget: club.budgetWage,
    };
  });

  /* ---- maillots ---- */
  const kits: Kit[] = [];
  for (const club of clubs) {
    const types: readonly Kit['type'][] = ['home', 'away', 'third'];
    for (const type of types) {
      kits.push({
        id: nextId(),
        clubId: club.id,
        season: startYear,
        type,
        primaryColor: type === 'home' ? club.primaryColor : pick(rng, KIT_COLORS),
        secondaryColor: type === 'home' ? club.secondaryColor : pick(rng, KIT_COLORS),
        pattern: pick(rng, KIT_PATTERNS),
      });
    }
  }

  /* ---- blessures initiales : 3 à 5 % de l'effectif ---- */
  const injuries: Injury[] = [];
  const injuryCount = Math.max(1, Math.round(players.length * 0.04));
  for (let i = 0; i < injuryCount; i++) {
    const player = players[Math.floor(rng() * players.length)];
    const days = int(rng, 7, 90);
    injuries.push({
      id: nextId(),
      playerId: player.id,
      type: pick(rng, INJURY_TYPES),
      severity: days > 45 ? 'serious' : days > 20 ? 'moderate' : 'minor',
      startDate: startDate,
      expectedReturn: addDays(startDate, days),
      actualReturn: null,
    });
  }

  /* ---- collections encore vides à ce stade ---- */
  const matchEvents: MatchEvent[] = [];
  const matchStats: MatchStats[] = [];
  const lineups: Lineup[] = [];
  const transferOffers: TransferOffer[] = [];

  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    tick: 0,
    date: startDate,
    countries: [country],
    competitions: [competition],
    seasons: [season],
    clubs,
    players,
    contracts,
    staff,
    fixtures,
    matchEvents,
    matchStats,
    lineups,
    tactics,
    tacticSlots,
    injuries,
    conditions,
    finances,
    transferOffers,
    kits,
    log: [],
  };
}

/**
 * Calendrier en double round-robin (aller-retour).
 *
 * 16 clubs → 15 journées à l'aller, 15 au retour, 240 matchs. La méthode du
 * cercle garantit qu'aucun club ne joue deux fois la même journée.
 */
export function buildDoubleRoundRobin(
  clubs: readonly Club[],
  season: Season,
  startDate: string,
  nextId: () => number,
): Fixture[] {
  const n = clubs.length;
  if (n % 2 !== 0) throw new Error('round-robin : nombre de clubs impair');
  const half = n / 2;
  const order = clubs.map(c => c.id);
  const fixtures: Fixture[] = [];
  let round = 1;

  for (let phase = 0; phase < 2; phase++) {
    const rotation = order.slice();
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < half; i++) {
        const a = rotation[i];
        const b = rotation[n - 1 - i];
        // Alternance des domiciles pour équilibrer l'avantage du terrain.
        const swap = (r % 2 === 1) !== (phase === 1);
        fixtures.push({
          id: nextId(),
          seasonId: season.id,
          round,
          homeClubId: swap ? b : a,
          awayClubId: swap ? a : b,
          date: addDays(startDate, (round - 1) * 7),
          status: 'scheduled',
          homeGoals: 0,
          awayGoals: 0,
        });
      }
      // Rotation du cercle : le premier reste fixe, les autres tournent.
      const fixed = rotation[0];
      const rest = rotation.slice(1);
      rest.unshift(rest.pop() as number);
      rotation.splice(0, rotation.length, fixed, ...rest);
      round++;
    }
  }
  return fixtures;
}
