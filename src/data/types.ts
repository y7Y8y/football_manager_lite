/**
 * Modèle de données — sous-ensemble MVP.
 *
 * Source : doc 25 « Modèle de données ». Seules les tables nécessaires à la
 * première boucle jouable sont typées ici ; les autres arrivent avec leur
 * système (M2, M3, M6).
 *
 * Conventions héritées de la doc 25 :
 *   - clés primaires entières, attribuées de façon déterministe ;
 *   - dates ISO 8601 (`YYYY-MM-DD`) ;
 *   - attributs 0–100, sauf `ca`, `pa` et `value` ;
 *   - montants en **entiers**, en centimes — jamais de flottant pour l'argent ;
 *   - un événement de match est immuable ;
 *   - le classement n'est jamais stocké, il se calcule depuis les matchs.
 */

/* ---------------------------------------------------------------- réferentiel */

export interface Country {
  id: number;
  name: string;
  code: string;
  reputation: number;
}

export interface CompetitionRules {
  maxSquad: number;
  foreignLimit: number;
  homegrownMin: number;
  loanLimit: number;
  ffpEnabled: boolean;
}

export interface Competition {
  id: number;
  countryId: number;
  name: string;
  type: 'league' | 'cup';
  level: number;
  reputation: number;
  rules: CompetitionRules;
}

export interface Season {
  id: number;
  competitionId: number;
  year: number;
  startDate: string;
  endDate: string;
}

/* ------------------------------------------------------- clubs et effectifs */

export interface Club {
  id: number;
  name: string;
  shortName: string;
  countryId: number;
  city: string;
  reputation: number;
  stadium: string;
  /** Centimes. */
  budgetTransfer: number;
  /** Centimes par semaine, masse salariale autorisée. */
  budgetWage: number;
  primaryColor: string;
  secondaryColor: string;
}

/** Poste canonique. L'ordre de l'enum sert au tri des tableaux. */
export type Position = 'GK' | 'DL' | 'DC' | 'DR' | 'DM' | 'MC' | 'ML' | 'MR' | 'AM' | 'ST' | 'WL' | 'WR';

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  /** Année de naissance ; l'âge se calcule, ne se stocke pas. */
  birthYear: number;
  nationalityId: number;
  position: Position;
  /** Capacité actuelle et potentielle, 0–200. */
  ca: number;
  pa: number;
  /** Centimes. */
  value: number;
  clubId: number;
  squadStatus: 'key' | 'regular' | 'squad' | 'youth' | 'transfer';
  morale: number;
  fitness: number;
  sharpness: number;
}

export interface Contract {
  id: number;
  playerId: number;
  clubId: number;
  start: string;
  end: string;
  /** Centimes par semaine. */
  wage: number;
  /** Centimes ; 0 = aucune clause. */
  releaseClause: number;
  optionYear: boolean;
  squadStatus: Player['squadStatus'];
}

export type StaffRole =
  | 'manager' | 'assistant' | 'coach' | 'fitness' | 'goalkeeping'
  | 'physio' | 'scout' | 'analyst' | 'youth';

export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  reputation: number;
  clubId: number;
  contractEnd: string;
}

/* -------------------------------------------------- compétitions et matchs */

export type FixtureStatus = 'scheduled' | 'played';

export interface Fixture {
  id: number;
  seasonId: number;
  round: number;
  homeClubId: number;
  awayClubId: number;
  date: string;
  status: FixtureStatus;
  homeGoals: number;
  awayGoals: number;
}

export type MatchEventType =
  | 'kickoff' | 'goal' | 'own_goal' | 'penalty_scored' | 'penalty_missed'
  | 'yellow' | 'red' | 'substitution' | 'injury' | 'halftime' | 'fulltime'
  | 'chance' | 'save';

/**
 * Immuable une fois écrit. `metadata` porte les champs variables sans
 * migration de schéma (doc 25).
 */
export interface MatchEvent {
  id: number;
  matchId: number;
  minute: number;
  second: number;
  type: MatchEventType;
  teamId: number;
  playerId: number | null;
  secondaryPlayerId: number | null;
  x: number;
  y: number;
  outcome: string | null;
  metadata: Record<string, number | string> | null;
}

export interface MatchStats {
  matchId: number;
  teamId: number;
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  passAccuracy: number;
  corners: number;
  fouls: number;
  yellows: number;
  reds: number;
}

export interface Lineup {
  id: number;
  matchId: number;
  teamId: number;
  formation: string;
  playerId: number;
  position: Position;
  role: string;
  duty: string;
  isCaptain: boolean;
}

/* ------------------------------------------------------------- transferts */

export type TransferOfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface TransferOffer {
  id: number;
  playerId: number;
  fromClubId: number;
  toClubId: number;
  /** Centimes. */
  fee: number;
  installments: number;
  status: TransferOfferStatus;
  createdAt: string;
}

/* ------------------------------------------------- tactique et entraînement */

export interface Tactic {
  id: number;
  clubId: number;
  name: string;
  formation: string;
  mentality: 'defensive' | 'balanced' | 'positive' | 'attacking';
  pressing: number;
  tempo: number;
  width: number;
}

export interface TacticSlot {
  id: number;
  tacticId: number;
  position: Position;
  role: string;
  duty: string;
  playerId: number | null;
}

/* ------------------------------------------------------- médical et finances */

export type InjurySeverity = 'minor' | 'moderate' | 'serious';

export interface Injury {
  id: number;
  playerId: number;
  type: string;
  severity: InjurySeverity;
  startDate: string;
  expectedReturn: string;
  actualReturn: string | null;
}

export interface PlayerCondition {
  playerId: number;
  fitness: number;
  sharpness: number;
  fatigue: number;
}

export interface ClubFinances {
  clubId: number;
  season: number;
  /** Centimes. */
  revenue: number;
  /** Centimes. */
  costs: number;
  /** Centimes. */
  transferBudget: number;
  /** Centimes. */
  wageBudget: number;
}

/* ----------------------------------------------------------------- contexte */

export interface Kit {
  id: number;
  clubId: number;
  season: number;
  type: 'home' | 'away' | 'third' | 'gk';
  primaryColor: string;
  secondaryColor: string;
  pattern: 'solid' | 'stripes' | 'sash' | 'hoops';
}

/* ------------------------------------------------------------------- monde */

/**
 * État complet du monde simulé. Une instance = une sauvegarde.
 * Le classement n'y figure pas : il se calcule depuis `fixtures`.
 */
export interface World {
  schemaVersion: number;
  seed: number;
  /** Nombre de ticks monde écoulés. Un tick = un jour. */
  tick: number;
  /** Date courante, ISO 8601. */
  date: string;

  countries: Country[];
  competitions: Competition[];
  seasons: Season[];
  clubs: Club[];
  players: Player[];
  contracts: Contract[];
  staff: Staff[];
  fixtures: Fixture[];
  matchEvents: MatchEvent[];
  matchStats: MatchStats[];
  lineups: Lineup[];
  tactics: Tactic[];
  tacticSlots: TacticSlot[];
  injuries: Injury[];
  conditions: PlayerCondition[];
  finances: ClubFinances[];
  transferOffers: TransferOffer[];
  kits: Kit[];

  /** Journal des ticks, pour l'observabilité et les tests. */
  log: WorldLogEntry[];
}

export interface WorldLogEntry {
  tick: number;
  date: string;
  system: string;
  message: string;
}

/** Version du format de sauvegarde. Toute migration la incrémente. */
export const SCHEMA_VERSION = 1;
