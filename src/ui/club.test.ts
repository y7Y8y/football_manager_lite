// @vitest-environment jsdom
/**
 * Tests de l'écran « Effectif » — critère de sortie de la phase 1 (doc 26) :
 * « afficher un club et son effectif ».
 *
 * jsdom ne calcule pas la mise en page : tout ce qui est vérifié ici porte sur
 * la structure du DOM, les valeurs lues et le comportement (tri, filtre,
 * recherche, sélection, clavier). Les mesures de largeur et de contraste ont
 * été faites séparément, hors sandbox.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { generateWorld } from '../data/generate';
import { createClubView, formatMoney, type ClubViewHandle } from './club';

const SEED = 20261017;

let view: ClubViewHandle;

function mount(): ClubViewHandle {
  const handle = createClubView({ world: generateWorld({ seed: SEED }) });
  document.body.appendChild(handle.element);
  return handle;
}

/** Lignes de joueurs (les lignes de groupe sont exclues). */
function rows(): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('tr.club-row'));
}

function headerLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.club-table thead th')).map(
    th => th.textContent?.replace(/[↑↓]/g, '').trim() ?? '',
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  view = mount();
});

describe('club et effectif affichés', () => {
  it('affiche le nom du club pris en main', () => {
    const world = generateWorld({ seed: SEED });
    const best = [...world.clubs].sort((a, b) => b.reputation - a.reputation)[0];
    expect(document.querySelector('.club-name')?.textContent).toBe(best.name);
  });

  it('affiche une ligne par joueur du club', () => {
    const world = generateWorld({ seed: SEED });
    const best = [...world.clubs].sort((a, b) => b.reputation - a.reputation)[0];
    const expected = world.players.filter(p => p.clubId === best.id).length;
    expect(rows()).toHaveLength(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('regroupe les joueurs par groupe de postes', () => {
    const groups = Array.from(document.querySelectorAll<HTMLElement>('tr.club-group td')).map(
      td => td.textContent?.replace(/\d+ joueurs$/, '').trim() ?? '',
    );
    expect(groups).toEqual(['Gardiens', 'Défense', 'Milieu', 'Attaque']);
  });

  it('déclare toutes les colonnes du tableau', () => {
    expect(headerLabels()).toEqual([
      'Joueur', 'Poste', 'Âge', 'CA', 'PA', 'Valeur', 'Moral', 'Condition',
      'Fin contrat', 'Statut',
    ]);
  });

  it('résume l’effectif dans la bande de synthèse', () => {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.club-summary dt')).map(
      dt => dt.textContent,
    );
    expect(labels).toContain('Joueurs');
    expect(labels).toContain('Âge moyen');
    expect(labels).toContain('Valeur totale');
    expect(labels).toContain('Masse salariale');
  });

  it('porte une légende lisible par lecteur d’écran', () => {
    expect(document.querySelector('.club-table caption')?.textContent).toBe('Effectif du club');
  });
});

describe('tri', () => {
  /** Valeurs d'une colonne, groupe de postes par groupe de postes. */
  function byGroup(selector: string): number[][] {
    const buckets: number[][] = [];
    let current: number[] | null = null;
    for (const tr of document.querySelectorAll<HTMLTableRowElement>('.club-table tbody tr')) {
      if (tr.classList.contains('club-group')) {
        current = [];
        buckets.push(current);
        continue;
      }
      current?.push(Number(tr.querySelector(selector)?.textContent ?? 'NaN'));
    }
    return buckets;
  }

  it('classe par capacité décroissante dans chaque groupe', () => {
    const buckets = byGroup('.col-ca');
    expect(buckets.length).toBeGreaterThan(1);
    for (const bucket of buckets) {
      expect(bucket).toEqual([...bucket].sort((a, b) => b - a));
    }
  });

  it('ne mélange jamais les groupes de postes', () => {
    const order = byGroup('.col-post');
    expect(order).toHaveLength(4);
  });

  it('inverse l’ordre au second clic sur la même colonne', () => {
    const caHeader = Array.from(document.querySelectorAll<HTMLButtonElement>('.club-sort')).find(
      b => b.textContent?.startsWith('CA'),
    );
    caHeader?.click();

    for (const bucket of byGroup('.col-ca')) {
      expect(bucket).toEqual([...bucket].sort((a, b) => a - b));
    }
  });

  it('trie par âge croissant quand on clique sur Âge', () => {
    const ageHeader = Array.from(document.querySelectorAll<HTMLButtonElement>('.club-sort')).find(
      b => b.textContent?.startsWith('Âge'),
    );
    ageHeader?.click();

    for (const bucket of byGroup('.col-age')) {
      expect(bucket).toEqual([...bucket].sort((a, b) => a - b));
    }
  });

  it('annonce le sens du tri aux lecteurs d’écran', () => {
    const caHeader = Array.from(document.querySelectorAll<HTMLButtonElement>('.club-sort')).find(
      b => b.textContent?.startsWith('CA'),
    );
    caHeader?.click();
    expect(document.querySelector('th.col-ca')?.getAttribute('aria-sort')).toBe('ascending');
  });
});

describe('filtre et recherche', () => {
  it('ne garde que les gardiens quand on filtre sur Gardiens', () => {
    const chip = Array.from(document.querySelectorAll<HTMLButtonElement>('.club-chip')).find(
      b => b.textContent?.startsWith('Gardiens'),
    );
    chip?.click();
    const postes = rows().map(r => r.querySelector('.col-post')?.textContent ?? '');
    expect(postes.length).toBeGreaterThan(0);
    expect(postes.every(p => p === 'GB')).toBe(true);
  });

  it('compte les joueurs de chaque groupe dans les puces', () => {
    const counts = Array.from(document.querySelectorAll<HTMLElement>('.club-chip .chip-count')).map(
      c => Number(c.textContent),
    );
    // La puce « Tous » double le total : on ne somme que les quatre groupes.
    expect(counts[0]).toBe(rows().length);
    expect(counts.slice(1).reduce((a, b) => a + b, 0)).toBe(rows().length);
    expect(counts.slice(1)).toHaveLength(4);
  });

  it('restreint la liste à la recherche saisie', () => {
    const search = document.querySelector<HTMLInputElement>('.club-search');
    if (!search) throw new Error('champ de recherche absent');
    const total = rows().length;
    const first = rows()[0];
    const name = first.querySelector('.club-name-txt')?.textContent ?? '';
    const lastName = name.split('. ')[1] ?? name;

    search.value = lastName.slice(0, 4);
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const shown = rows();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(total);
    for (const row of shown) {
      expect(row.querySelector('.club-name-txt')?.textContent ?? '').toContain(lastName.slice(0, 4));
    }
  });

  it('affiche un message quand rien ne correspond', () => {
    const search = document.querySelector<HTMLInputElement>('.club-search');
    if (!search) throw new Error('champ de recherche absent');
    search.value = 'zzzzzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.club-empty')?.textContent).toContain('Aucun joueur');
  });
});

describe('fiche joueur', () => {
  it('ouvre le tiroir à la sélection d’une ligne', () => {
    rows()[0].click();
    const drawer = document.querySelector<HTMLElement>('.club-drawer');
    expect(drawer?.hidden).toBe(false);
    expect(document.querySelector('.club-layout')?.classList.contains('is-open')).toBe(true);
    expect(document.querySelector('.club-drawer-name')?.textContent).toMatch(/\w+/);
  });

  it('affiche le détail contractuel du joueur choisi', () => {
    rows()[0].click();
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.club-facts dt')).map(
      dt => dt.textContent,
    );
    expect(labels).toContain('Salaire');
    expect(labels).toContain('Fin de contrat');
    expect(labels).toContain('Clause de départ');
  });

  it('se referme avec la touche Échap', () => {
    rows()[0].click();
    expect(document.querySelector<HTMLElement>('.club-drawer')?.hidden).toBe(false);

    document.querySelector<HTMLElement>('.club-view')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.querySelector<HTMLElement>('.club-drawer')?.hidden).toBe(true);
    expect(view.selectedPlayerId).toBeNull();
  });

  it('se déplace dans l’effectif avec les flèches', () => {
    rows()[0].click();
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(view.selectedPlayerId).not.toBeNull();

    const names = rows().map(r => r.dataset.playerId);
    expect(names).toContain(String(view.selectedPlayerId));
  });
});

describe('changement de club', () => {
  it('affiche un autre club et son effectif', () => {
    const before = document.querySelector('.club-name')?.textContent;
    const beforeRows = rows().length;

    (document.querySelector<HTMLButtonElement>('.club-btn') as HTMLButtonElement).click();

    expect(document.querySelector('.club-name')?.textContent).not.toBe(before);
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBe(beforeRows);
  });

  it('referme la fiche ouverte', () => {
    rows()[0].click();
    (document.querySelector<HTMLButtonElement>('.club-btn') as HTMLButtonElement).click();
    expect(document.querySelector<HTMLElement>('.club-drawer')?.hidden).toBe(true);
  });
});

describe('mise à jour', () => {
  it('relit le monde sans casser la sélection', () => {
    rows()[0].click();
    const id = view.selectedPlayerId;
    view.update();
    expect(view.selectedPlayerId).toBe(id);
    const before = rows().length;
    expect(rows()).toHaveLength(before);
    expect(before).toBeGreaterThan(0);
  });

  it('ne laisse rien fuir après destroy', () => {
    view.destroy();
    expect(document.querySelector('.club-row')).toBeNull();
  });
});

describe('cohérence des données affichées', () => {
  it('n’affiche que des joueurs du club courant', () => {
    const world = generateWorld({ seed: SEED });
    const best = [...world.clubs].sort((a, b) => b.reputation - a.reputation)[0];
    const ids = new Set(world.players.filter(p => p.clubId === best.id).map(p => String(p.id)));

    for (const row of rows()) {
      expect(ids.has(row.dataset.playerId ?? '')).toBe(true);
    }
  });

  it('n’utilise jamais la couleur seule : les alertes portent un texte', () => {
    const badges = Array.from(document.querySelectorAll<HTMLElement>('.club-badge'));
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) {
      expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});

describe('formatage des montants', () => {
  it('affiche les millions avec une décimale', () => {
    expect(formatMoney(27920000000)).toBe('279,2\u00a0M\u20ac');
  });

  it('affiche les milliers en k€', () => {
    expect(formatMoney(100000)).toBe('1\u00a0k\u20ac');
    expect(formatMoney(1234500)).toBe('12\u00a0k\u20ac');
  });

  it('affiche les petits montants en euros', () => {
    expect(formatMoney(5000)).toBe('50\u00a0\u20ac');
  });

  it('ne sépare jamais l’unité du chiffre', () => {
    for (const c of [0, 1, 5000, 100000, 1234500, 125000000, 27920000000, 125000000000]) {
      expect(formatMoney(c)).toMatch(/\u00a0(M|Md|k)?\u20ac$/);
    }
  });

  it('passe au palier milliard', () => {
    expect(formatMoney(125000000000)).toBe('1,25\u00a0Md\u20ac');
  });

  it('garde deux décimales sous 10 M€', () => {
    expect(formatMoney(125000000)).toBe('1,25\u00a0M\u20ac');
    expect(formatMoney(27920000000)).toBe('279,2\u00a0M\u20ac');
  });
});
