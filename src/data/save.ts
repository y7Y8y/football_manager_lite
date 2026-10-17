/**
 * Sauvegarde et persistance — Phase 1 de la doc 26, doc 37.
 *
 * Le format est **versionné dès le départ** : la doc 26 nomme « sauvegarde
 * cassée » comme risque et prescrit de versionner tôt. Toute évolution du
 * schéma passe par une migration, jamais par une réécriture silencieuse.
 *
 * Enveloppe :
 *   { "fmt": "fml-save", "version": 1, "savedAtTick": 42, "world": { … } }
 *
 * `savedAtTick` est lu dans le monde, pas dans l'horloge machine : recharger
 * une sauvegarde ne dépend d'aucun temps réel.
 */

import { SCHEMA_VERSION, type World } from './types';

export const SAVE_FORMAT = 'fml-save';

export interface SaveEnvelope {
  fmt: typeof SAVE_FORMAT;
  version: number;
  savedAtTick: number;
  world: World;
}

export class SaveVersionError extends Error {
  constructor(readonly found: unknown, readonly supported: number) {
    super(
      `sauvegarde incompatible : version ${String(found)} trouvée, ` +
      `version ${supported} supportée`,
    );
    this.name = 'SaveVersionError';
  }
}

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

/**
 * Sérialisation canonique : clés triées récursivement.
 * Indispensable pour comparer deux mondes terme à terme dans les tests de
 * déterminisme — `JSON.stringify` seul dépend de l'ordre d'insertion.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

/** Sérialise un monde dans son enveloppe versionnée. */
export function saveWorld(world: World): string {
  const envelope: SaveEnvelope = {
    fmt: SAVE_FORMAT,
    version: SCHEMA_VERSION,
    savedAtTick: world.tick,
    world,
  };
  return JSON.stringify(envelope);
}

/**
 * Recharge un monde. Refuse tout ce qui n'est pas au format et à la version
 * attendus — mieux vaut un refus net qu'une sauvegarde corrompue (doc 26).
 */
export function loadWorld(payload: string): World {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new SaveFormatError('sauvegarde illisible : JSON invalide');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new SaveFormatError('sauvegarde illisible : objet attendu');
  }
  const envelope = parsed as Partial<SaveEnvelope>;
  if (envelope.fmt !== SAVE_FORMAT) {
    throw new SaveFormatError(`sauvegarde hors format : ${String(envelope.fmt)}`);
  }
  if (envelope.version !== SCHEMA_VERSION) {
    throw new SaveVersionError(envelope.version, SCHEMA_VERSION);
  }
  if (!envelope.world || typeof envelope.world !== 'object') {
    throw new SaveFormatError('sauvegarde illisible : monde absent');
  }

  const world = envelope.world as World;
  if (world.schemaVersion !== SCHEMA_VERSION) {
    throw new SaveVersionError(world.schemaVersion, SCHEMA_VERSION);
  }
  return world;
}

/* --------------------------------------------------------------- migrations */

export type Migration = (world: World) => World;

/**
 * Registre des migrations. Une migration = une transformation pure, testée sur
 * une sauvegarde réelle (doc 25). L'ajout d'une entrée incrémente la version
 * courante : `MIGRATIONS[1]` fait passer le monde de v1 à v2.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // 1: (world) => ({ ...world, schemaVersion: 2, … })
};

/** Version la plus haute atteignable par migration. */
export const LATEST_VERSION = SCHEMA_VERSION + Object.keys(MIGRATIONS).length;
