/** Tests des données pures du terrain (aucune dépendance graphique). */

import { describe, expect, it } from 'vitest';
import { PITCH, PITCH_BOUNDS, formationSlots, teamColorOf } from './pitch';

describe('cotes du terrain', () => {
  it('respecte les dimensions réglementaires', () => {
    expect(PITCH.length).toBe(105);
    expect(PITCH.width).toBe(68);
    expect(PITCH.centerCircleRadius).toBeCloseTo(9.15);
    expect(PITCH.penaltySpot).toBe(11);
  });

  it('centre le repère sur le terrain', () => {
    expect(PITCH_BOUNDS.minX).toBe(-52.5);
    expect(PITCH_BOUNDS.maxX).toBe(52.5);
    expect(PITCH_BOUNDS.minZ).toBe(-34);
    expect(PITCH_BOUNDS.maxZ).toBe(34);
  });
});

describe('formation 4-3-3', () => {
  it('fournit 11 positions par équipe, dans les limites', () => {
    for (const team of [0, 1] as const) {
      const slots = formationSlots(team);

      expect(slots).toHaveLength(11);
      for (const slot of slots) {
        expect(slot.x).toBeGreaterThanOrEqual(PITCH_BOUNDS.minX);
        expect(slot.x).toBeLessThanOrEqual(PITCH_BOUNDS.maxX);
        expect(slot.z).toBeGreaterThanOrEqual(PITCH_BOUNDS.minZ);
        expect(slot.z).toBeLessThanOrEqual(PITCH_BOUNDS.maxZ);
      }
    }
  });

  it('place les deux équipes de part et d’autre du terrain', () => {
    const home = formationSlots(0);
    const away = formationSlots(1);

    // Le gardien à domicile défend son propre côté.
    expect(home[0].x).toBeLessThan(0);
    expect(away[0].x).toBeGreaterThan(0);

    // Les formations sont symétriques.
    home.forEach((slot, index) => {
      expect(slot.z).toBeCloseTo(away[index].z);
      expect(slot.x).toBeCloseTo(-away[index].x);
    });
  });
});

describe('couleurs', () => {
  it('distingue les deux équipes et les gardiens', () => {
    expect(teamColorOf(0, 'FIELD')).toBe('#2563eb');
    expect(teamColorOf(1, 'FIELD')).toBe('#f97316');
    expect(teamColorOf(0, 'GK')).toBe('#22d3ee');
    expect(teamColorOf(1, 'GK')).toBe('#22d3ee');
  });
});
