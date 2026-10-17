/**
 * Tests du générateur de monde — critère de sortie de la Phase 1 (doc 26) :
 * « afficher un club et son effectif ».
 *
 * Ces tests vérifient les invariants du modèle, pas seulement qu'il tourne :
 * cohérence des clés étrangères, calendrier complet, argent en entiers,
 * déterminisme.
 */

import { describe, expect, it } from 'vitest';
import { addDays, buildDoubleRoundRobin, generateWorld } from './generate';
import { SCHEMA_VERSION, type Club, type Season, type World } from './types';

const SEED = 20261017;

function world(clubCount = 16): World {
  return generateWorld({ seed: SEED, clubCount });
}

describe('volumétrie', () => {
  it('produit 16 clubs et environ 500 joueurs', () => {
    const w = world();
    expect(w.clubs).toHaveLength(16);
    expect(w.players.length).toBeGreaterThanOrEqual(400);
    expect(w.players.length).toBeLessThanOrEqual(600);
  });

  it('respecte les bornes de la doc 26 (10 à 20 clubs)', () => {
    expect(generateWorld({ seed: SEED, clubCount: 4 }).clubs).toHaveLength(10);
    expect(generateWorld({ seed: SEED, clubCount: 99 }).clubs).toHaveLength(20);
  });

  it('donne un staff complet à chaque club', () => {
    const w = world();
    for (const club of w.clubs) {
      const own = w.staff.filter(s => s.clubId === club.id);
      expect(own.length).toBeGreaterThanOrEqual(8);
      expect(own.some(s => s.role === 'manager')).toBe(true);
    }
  });

  it('attribue un maillot de chaque type à chaque club', () => {
    const w = world();
    for (const club of w.clubs) {
      const kits = w.kits.filter(k => k.clubId === club.id);
      expect(kits.map(k => k.type).sort()).toEqual(['away', 'home', 'third']);
    }
  });
});

describe('déterminisme', () => {
  it('produit deux mondes identiques à graine égale', () => {
    expect(world()).toEqual(world());
  });

  it('produit deux mondes différents à graines différentes', () => {
    expect(world()).not.toEqual(generateWorld({ seed: SEED + 1, clubCount: 16 }));
  });

  it('attribue des identifiants uniques', () => {
    const w = world();
    const ids = [
      ...w.players.map(p => p.id),
      ...w.clubs.map(c => c.id),
      ...w.contracts.map(c => c.id),
      ...w.fixtures.map(f => f.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cohérence du modèle', () => {
  it('rattache chaque joueur à un club existant', () => {
    const w = world();
    const clubIds = new Set(w.clubs.map(c => c.id));
    for (const p of w.players) expect(clubIds.has(p.clubId)).toBe(true);
  });

  it('rattache chaque contrat à un joueur existant', () => {
    const w = world();
    const playerIds = new Set(w.players.map(p => p.id));
    for (const c of w.contracts) expect(playerIds.has(c.playerId)).toBe(true);
  });

  it('rattache chaque blessure à un joueur existant', () => {
    const w = world();
    const playerIds = new Set(w.players.map(p => p.id));
    for (const i of w.injuries) expect(playerIds.has(i.playerId)).toBe(true);
  });

  it('rattache chaque poste tactique à un joueur du même club', () => {
    const w = world();
    for (const slot of w.tacticSlots) {
      if (slot.playerId === null) continue;
      const player = w.players.find(p => p.id === slot.playerId);
      const tactic = w.tactics.find(t => t.id === slot.tacticId);
      expect(player).toBeDefined();
      expect(tactic).toBeDefined();
      expect(player?.clubId).toBe(tactic?.clubId);
    }
  });

  it('compose chaque onze de départ avec 11 joueurs distincts', () => {
    const w = world();
    for (const tactic of w.tactics) {
      const slots = w.tacticSlots.filter(s => s.tacticId === tactic.id);
      expect(slots).toHaveLength(11);
      const filled = slots.filter(s => s.playerId !== null);
      expect(new Set(filled.map(s => s.playerId)).size).toBe(filled.length);
    }
  });

  it('donne un gardien à chaque équipe', () => {
    const w = world();
    for (const tactic of w.tactics) {
      const gk = w.tacticSlots.filter(s => s.tacticId === tactic.id && s.position === 'GK');
      expect(gk).toHaveLength(1);
    }
  });
});

describe('calendrier', () => {
  it('construit un aller-retour complet', () => {
    const w = world();
    // 16 clubs → 15 journées × 2 phases = 30 journées, 8 matchs par journée.
    expect(w.fixtures).toHaveLength(240);
    const rounds = new Set(w.fixtures.map(f => f.round));
    expect(rounds.size).toBe(30);
    for (let r = 1; r <= 30; r++) {
      expect(w.fixtures.filter(f => f.round === r)).toHaveLength(8);
    }
  });

  it('ne fait jamais jouer deux fois le même club dans une journée', () => {
    const w = world();
    for (let r = 1; r <= 30; r++) {
      const day = w.fixtures.filter(f => f.round === r);
      const seen = new Set<number>();
      for (const f of day) {
        expect(seen.has(f.homeClubId)).toBe(false);
        expect(seen.has(f.awayClubId)).toBe(false);
        expect(f.homeClubId).not.toBe(f.awayClubId);
        seen.add(f.homeClubId);
        seen.add(f.awayClubId);
      }
    }
  });

  it('donne à chaque club 15 matchs à domicile et 15 à l’extérieur', () => {
    const w = world();
    for (const club of w.clubs) {
      const home = w.fixtures.filter(f => f.homeClubId === club.id).length;
      const away = w.fixtures.filter(f => f.awayClubId === club.id).length;
      expect(home).toBe(15);
      expect(away).toBe(15);
    }
  });

  it('appaire chaque couple de clubs exactement deux fois', () => {
    const w = world();
    const pairs = new Map<string, number>();
    for (const f of w.fixtures) {
      const key = [f.homeClubId, f.awayClubId].sort((a, b) => a - b).join('-');
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    // 16 clubs → 120 couples, chacun joué deux fois.
    expect(pairs.size).toBe(120);
    for (const count of pairs.values()) expect(count).toBe(2);
  });

  it('espace les journées d’une semaine', () => {
    const w = world();
    const dates = [...new Set(w.fixtures.map(f => f.date))].sort();
    expect(dates).toHaveLength(30);
    for (let i = 1; i < dates.length; i++) {
      expect(addDays(dates[i - 1], 7)).toBe(dates[i]);
    }
  });

  it('rejette un nombre de clubs impair', () => {
    const clubs: Club[] = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1, name: `C${i}`, shortName: 'C', countryId: 1, city: 'X',
      reputation: 50, stadium: 'S', budgetTransfer: 0, budgetWage: 0,
      primaryColor: '#000', secondaryColor: '#fff',
    }));
    const season: Season = { id: 1, competitionId: 1, year: 2026, startDate: '2026-08-08', endDate: '2027-05-30' };
    expect(() => buildDoubleRoundRobin(clubs, season, '2026-08-08', () => 1)).toThrow();
  });
});

describe('règles de la doc 25', () => {
  it('versionne le schéma', () => {
    expect(world().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('garde l’argent en entiers', () => {
    const w = world();
    const amounts = [
      ...w.players.map(p => p.value),
      ...w.contracts.map(c => c.wage),
      ...w.contracts.map(c => c.releaseClause),
      ...w.finances.map(f => f.revenue),
      ...w.finances.map(f => f.costs),
      ...w.clubs.map(c => c.budgetTransfer),
    ];
    for (const amount of amounts) {
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThanOrEqual(0);
    }
  });

  it('borne les attributs 0–100 et ca/pa 0–200', () => {
    const w = world();
    for (const p of w.players) {
      expect(p.morale).toBeGreaterThanOrEqual(0);
      expect(p.morale).toBeLessThanOrEqual(100);
      expect(p.fitness).toBeLessThanOrEqual(100);
      expect(p.ca).toBeGreaterThanOrEqual(0);
      expect(p.ca).toBeLessThanOrEqual(200);
      expect(p.pa).toBeGreaterThanOrEqual(p.ca);
    }
  });

  it('n’a aucun match déjà joué', () => {
    for (const f of world().fixtures) expect(f.status).toBe('scheduled');
  });

  it('laisse les collections de match vides avant M2', () => {
    const w = world();
    expect(w.matchEvents).toHaveLength(0);
    expect(w.matchStats).toHaveLength(0);
    expect(w.lineups).toHaveLength(0);
  });

  it('ne stocke aucun classement', () => {
    // Le classement se calcule depuis les matchs : il n'a pas de place ici.
    expect(Object.keys(world())).not.toContain('standings');
    expect(Object.keys(world())).not.toContain('table');
  });
});
