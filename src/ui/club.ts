/**
 * Écran « Effectif » — critère de sortie de la phase 1 (doc 26) :
 * « afficher un club et son effectif ».
 *
 * Principes retenus :
 *   - la vue ne calcule rien : elle lit un `World` déjà généré. Toute la
 *     logique de simulation vit dans src/core et src/data ;
 *   - le tri, le filtrage et la recherche sont locaux à l'écran ;
 *   - la sélection ouvre une fiche joueur dans un tiroir latéral ;
 *   - aucune couleur ne porte seule une information ;
 *   - aucune police n'est réduite : ce sont des colonnes qui disparaissent
 *     quand la largeur manque (voir club.css).
 */

import './fonts.css';
import './club.css';

import type {
  Club,
  Contract,
  Injury,
  Player,
  Position,
  World,
} from '../data/types';
import { el } from './dom';

/* ------------------------------------------------------------- formatage */

/** Espace insécable : l'unité ne se sépare jamais de son chiffre. */
const NBSP = '\u00a0';
/** Espace fine insécable : séparateur de milliers. */
const NNBSP = '\u202f';
const EURO = '\u20ac';

function groupDigits(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

/**
 * Nombre à la française : virgule décimale, espaces fines insécables entre
 * les milliers. Le séparateur n'apparait qu'au-delà de quatre chiffres, ce
 * qui est rare pour un montant de club mais reste correct.
 */
function decimal(value: number, digits: number): string {
  const fixed = Math.abs(value).toFixed(digits);
  const dot = fixed.indexOf('.');
  const intPart = dot === -1 ? fixed : fixed.slice(0, dot);
  const frac = dot === -1 ? '' : fixed.slice(dot + 1);
  const sign = value < 0 ? '-' : '';
  return sign + groupDigits(intPart) + (frac ? ',' + frac : '');
}

/**
 * Montant en centimes -> libellé lisible. La doc 25 impose des entiers en
 * centimes ; on ne divise qu'à l'affichage.
 */
export function formatMoney(centimes: number): string {
  const euros = centimes / 100;
  if (Math.abs(euros) >= 1e9) return `${decimal(euros / 1e9, 2)}${NBSP}Md${EURO}`;
  if (Math.abs(euros) >= 1e6) {
    // Sous 10 M€ on garde deux décimales : 1,25 M€ est plus parlant que 1,3 M€.
    const digits = Math.abs(euros) >= 1e7 ? 1 : 2;
    return `${decimal(euros / 1e6, digits)}${NBSP}M${EURO}`;
  }
  if (Math.abs(euros) >= 1e3) return `${decimal(euros / 1e3, 0)}${NBSP}k${EURO}`;
  return `${decimal(euros, 0)}${NBSP}${EURO}`;
}

/** Un nombre avec une décimale, séparateur français. */
export function formatOne(value: number): string {
  return decimal(value, 1);
}

/** Date ISO -> libellé jour/mois/année. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* ----------------------------------------------------------------- postes */

type GroupKey = 'GK' | 'DEF' | 'MIL' | 'ATT';

interface PosteInfo {
  /** Abréviation affichée, vocabulaire de la doc 41. */
  label: string;
  /** Libellé complet, pour l'infobulle et la fiche. */
  long: string;
  group: GroupKey;
}

const POSTES: Record<Position, PosteInfo> = {
  GK: { label: 'GB', long: 'Gardien', group: 'GK' },
  DL: { label: 'DG', long: 'Latéral gauche', group: 'DEF' },
  DC: { label: 'DC', long: 'Défenseur central', group: 'DEF' },
  DR: { label: 'DD', long: 'Latéral droit', group: 'DEF' },
  DM: { label: 'MDC', long: 'Milieu défensif', group: 'MIL' },
  MC: { label: 'MC', long: 'Milieu central', group: 'MIL' },
  ML: { label: 'MG', long: 'Milieu gauche', group: 'MIL' },
  MR: { label: 'MD', long: 'Milieu droit', group: 'MIL' },
  AM: { label: 'MOC', long: 'Meneur de jeu', group: 'MIL' },
  ST: { label: 'BU', long: 'Buteur', group: 'ATT' },
  WL: { label: 'AG', long: 'Ailier gauche', group: 'ATT' },
  WR: { label: 'AD', long: 'Ailier droit', group: 'ATT' },
};

const GROUP_ORDER: readonly GroupKey[] = ['GK', 'DEF', 'MIL', 'ATT'];

const GROUP_LABEL: Record<GroupKey, string> = {
  GK: 'Gardiens',
  DEF: 'Défense',
  MIL: 'Milieu',
  ATT: 'Attaque',
};

const POSITION_ORDER: readonly Position[] = [
  'GK', 'DL', 'DC', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST', 'WL', 'WR',
];

/* ------------------------------------------------------------------ lignes */

interface SquadRow {
  player: Player;
  contract?: Contract;
  injury?: Injury;
  poste: PosteInfo;
  age: number;
  /** Blessure en cours (non refermée). */
  injured: boolean;
}

type SortKey =
  | 'name' | 'position' | 'age' | 'ca' | 'pa' | 'value'
  | 'morale' | 'fitness' | 'end';

interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

interface Column {
  key: SortKey;
  head: string;
  cls: string;
  /** La colonne est-elle cliquable ? */
  sortable: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'name', head: 'Joueur', cls: 'col-name', sortable: true },
  { key: 'position', head: 'Poste', cls: 'col-post', sortable: true },
  { key: 'age', head: 'Âge', cls: 'col-age', sortable: true },
  { key: 'ca', head: 'CA', cls: 'col-ca', sortable: true },
  { key: 'pa', head: 'PA', cls: 'col-pa', sortable: true },
  { key: 'value', head: 'Valeur', cls: 'col-value', sortable: true },
  { key: 'morale', head: 'Moral', cls: 'col-morale', sortable: true },
  { key: 'fitness', head: 'Condition', cls: 'col-fitness', sortable: true },
  { key: 'end', head: 'Fin contrat', cls: 'col-end', sortable: true },
  { key: 'end', head: 'Statut', cls: 'col-status', sortable: false },
];

/* ----------------------------------------------------------------- seuils */

function moraleLevel(value: number): 'ok' | 'warn' | 'bad' {
  if (value < 40) return 'bad';
  if (value < 55) return 'warn';
  return 'ok';
}

function moraleLabel(value: number): string {
  const level = moraleLevel(value);
  if (level === 'bad') return 'Mauvaise';
  if (level === 'warn') return 'Moyenne';
  return 'Bonne';
}

function fitnessLevel(value: number): 'ok' | 'warn' | 'bad' {
  if (value < 70) return 'bad';
  if (value < 85) return 'warn';
  return 'ok';
}

function fitnessLabel(value: number): string {
  const level = fitnessLevel(value);
  if (level === 'bad') return 'Basse';
  if (level === 'warn') return 'Correcte';
  return 'Optimale';
}

const STATUS_LABEL: Record<Player['squadStatus'], string> = {
  key: 'Cadre',
  regular: 'Titulaire',
  squad: 'Remplaçant',
  youth: 'Jeune',
  transfer: 'Transfert',
};

const SEVERITY_LABEL: Record<Injury['severity'], string> = {
  minor: 'légère',
  moderate: 'moyenne',
  serious: 'grave',
};

/* ------------------------------------------------------------------- vue */

export interface ClubViewHandle {
  element: HTMLElement;
  /** Relit le monde et redessine. Appelé par la boucle de rafraîchissement. */
  update: () => void;
  /** Joueur sélectionné, ou null. */
  readonly selectedPlayerId: number | null;
  /** Passe au club suivant. */
  nextClub: () => void;
  destroy: () => void;
}

export interface ClubViewOptions {
  world: World;
  /** Index du club pris en main au départ. */
  clubIndex?: number;
  /** Appelé quand l'utilisateur change de club. */
  onClubChange?: (club: Club) => void;
}

export function createClubView(options: ClubViewOptions): ClubViewHandle {
  const world = options.world;
  let clubIndex = options.clubIndex ?? 0;
  let sort: SortState = { key: 'ca', dir: -1 };
  let groupFilter: GroupKey | 'ALL' = 'ALL';
  let query = '';
  let selectedPlayerId: number | null = null;

  /* ------------------------------------------------------------- index */

  /** Les clubs sont ordonnés par réputation décroissante : le premier est
   *  le plus prestigieux, ce qui donne un point de départ parlant. */
  const clubs = [...world.clubs].sort((a, b) => b.reputation - a.reputation);

  const contractsByPlayer = new Map<number, Contract>();
  for (const c of world.contracts) {
    const existing = contractsByPlayer.get(c.playerId);
    if (!existing || c.end > existing.end) contractsByPlayer.set(c.playerId, c);
  }

  const injuriesByPlayer = new Map<number, Injury>();
  for (const i of world.injuries) {
    if (i.actualReturn !== null) continue;
    const existing = injuriesByPlayer.get(i.playerId);
    if (!existing || i.expectedReturn > existing.expectedReturn) {
      injuriesByPlayer.set(i.playerId, i);
    }
  }

  const tacticsByClub = new Map<number, { formation: string; mentality: string }>();
  for (const t of world.tactics) {
    if (!tacticsByClub.has(t.clubId)) {
      tacticsByClub.set(t.clubId, { formation: t.formation, mentality: t.mentality });
    }
  }

  const countryName = (id: number): string =>
    world.countries.find(c => c.id === id)?.name ?? '—';

  /* ---------------------------------------------------------- racine DOM */

  const root = el('section', { class: 'club-view' });
  root.setAttribute('aria-label', 'Effectif du club');

  const head = el('header', { class: 'club-head' });
  const actions = el('div', { class: 'club-actions' });
  const summary = el('dl', { class: 'club-summary' });
  const layout = el('div', { class: 'club-layout' });
  const tableWrap = el('div', { class: 'club-table-wrap' });
  const table = el('table', { class: 'club-table' });

  const caption = el('caption', { class: 'club-sr', text: 'Effectif du club' });
  caption.style.position = 'absolute';
  table.appendChild(caption);

  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);
  tableWrap.appendChild(table);
  layout.appendChild(tableWrap);

  root.append(head, actions, summary, layout);

  /* --------------------------------------------------------- en-tête */

  const crest = el('div', { class: 'club-crest' });
  crest.appendChild(el('span'));
  crest.appendChild(el('span'));

  const nameEl = el('h1', { class: 'club-name' });
  const subEl = el('p', { class: 'club-sub' });
  const namesBox = el('div', { class: 'club-names' });
  namesBox.append(nameEl, subEl);

  const idBox = el('div', { class: 'club-id' });
  idBox.append(crest, namesBox);

  const meta = el('dl', { class: 'club-meta' });
  head.append(idBox, meta);

  /* ------------------------------------------------------- commandes */

  const changeButton = el('button', { class: 'club-btn', text: 'Changer de club' });
  changeButton.type = 'button';
  changeButton.addEventListener('click', () => {
    nextClub();
    options.onClubChange?.(currentClub());
  });

  const filters = el('div', { class: 'club-filters' });
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filtrer par groupe de postes');

  const search = el('input', { class: 'club-search' });
  search.type = 'search';
  search.placeholder = 'Rechercher un joueur';
  search.setAttribute('aria-label', 'Rechercher un joueur dans l’effectif');
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    renderRows();
  });

  actions.append(changeButton, filters, search);

  /* ------------------------------------------------------------ tiroir */

  const drawer = el('aside', { class: 'club-drawer' });
  drawer.setAttribute('aria-label', 'Fiche du joueur sélectionné');
  drawer.hidden = true;
  layout.appendChild(drawer);

  /* ------------------------------------------------------------ calcul */

  function currentClub(): Club {
    return clubs[((clubIndex % clubs.length) + clubs.length) % clubs.length];
  }

  function nextClub(): void {
    clubIndex = (clubIndex + 1) % clubs.length;
    selectedPlayerId = null;
    renderAll();
  }

  function squadRows(): SquadRow[] {
    const club = currentClub();
    const year = Number(world.date.slice(0, 4));
    const rows: SquadRow[] = [];

    for (const p of world.players) {
      if (p.clubId !== club.id) continue;
      const injury = injuriesByPlayer.get(p.id);
      rows.push({
        player: p,
        contract: contractsByPlayer.get(p.id),
        injury,
        poste: POSTES[p.position],
        age: year - p.birthYear,
        injured: injury !== undefined,
      });
    }
    return rows;
  }

  function compare(a: SquadRow, b: SquadRow, key: SortKey): number {
    switch (key) {
      case 'name':
        return a.player.lastName.localeCompare(b.player.lastName, 'fr');
      case 'position':
        return (
          POSITION_ORDER.indexOf(a.player.position) -
          POSITION_ORDER.indexOf(b.player.position)
        );
      case 'age':
        return a.age - b.age;
      case 'ca':
        return a.player.ca - b.player.ca;
      case 'pa':
        return a.player.pa - b.player.pa;
      case 'value':
        return a.player.value - b.player.value;
      case 'morale':
        return a.player.morale - b.player.morale;
      case 'fitness':
        return a.player.fitness - b.player.fitness;
      case 'end':
        return (a.contract?.end ?? '').localeCompare(b.contract?.end ?? '');
    }
  }

  function sortRows(rows: SquadRow[]): SquadRow[] {
    const factor = sort.dir;
    return [...rows].sort((a, b) => {
      const primary = compare(a, b, sort.key) * factor;
      if (primary !== 0) return primary;
      // À égalité, le groupe puis la capacité départagent — jamais l'ordre
      // du tableau source, qui dépend de l'identifiant.
      const group =
        GROUP_ORDER.indexOf(a.poste.group) - GROUP_ORDER.indexOf(b.poste.group);
      if (group !== 0) return group;
      return b.player.ca - a.player.ca;
    });
  }

  /** Lignes retenues par le filtre et la recherche, encore non triées. */
  function visibleRows(): SquadRow[] {
    let rows = squadRows();
    if (groupFilter !== 'ALL') {
      rows = rows.filter(r => r.poste.group === groupFilter);
    }
    if (query.length > 0) {
      rows = rows.filter(
        r =>
          r.player.lastName.toLowerCase().includes(query) ||
          r.player.firstName.toLowerCase().includes(query) ||
          r.poste.label.toLowerCase() === query,
      );
    }
    return rows;
  }

  /**
   * Groupes de postes dans l'ordre canonique, tri appliqué À L'INTÉRIEUR de
   * chaque groupe. Le regroupement passe avant le tri : un tableau où les
   * gardiens et les attaquants s'entremêlent ne se lit pas.
   */
  function groupedRows(): { group: GroupKey; rows: SquadRow[] }[] {
    const rows = visibleRows();
    return GROUP_ORDER.map(group => ({
      group,
      rows: sortRows(rows.filter(r => r.poste.group === group)),
    })).filter(bucket => bucket.rows.length > 0);
  }

  /** Ordre de parcours clavier : groupe par groupe, tel qu'affiché. */
  function flatRows(): SquadRow[] {
    return groupedRows().flatMap(bucket => bucket.rows);
  }

  /* --------------------------------------------------------- rendu tête */

  function renderHead(): void {
    const club = currentClub();
    const tactic = tacticsByClub.get(club.id);
    const country = countryName(club.countryId);

    const [bandTop, bandBottom] = Array.from(crest.children) as HTMLElement[];
    bandTop.style.background = club.primaryColor;
    bandBottom.style.background = club.secondaryColor;
    crest.title = `${club.name} — couleurs du club`;

    nameEl.textContent = club.name;
    subEl.textContent = `${club.city} · ${club.stadium} · ${country}`;

    meta.replaceChildren(
      ...metaPair('Réputation', String(club.reputation)),
      ...metaPair('Formation', tactic?.formation ?? '—'),
      ...metaPair(
        'Mentalité',
        tactic ? tactic.mentality.charAt(0).toUpperCase() + tactic.mentality.slice(1) : '—',
      ),
      ...metaPair('Date', formatDate(world.date)),
      ...metaPair('Jour', String(world.tick + 1)),
    );
  }

  /** Une paire terme/valeur dans une liste de définitions horizontale. */
  function metaPair(label: string, value: string): HTMLElement[] {
    return [
      pair('dt', label),
      pair('dd', value),
    ];
  }

  function pair(tag: 'dt' | 'dd', text: string): HTMLElement {
    const wrapper = el('div', {});
    wrapper.appendChild(el(tag, { text }));
    return wrapper;
  }

  /* ----------------------------------------------------- rendu synthèse */

  function renderSummary(): void {
    const rows = squadRows();
    const count = rows.length;
    const avgAge = count ? rows.reduce((s, r) => s + r.age, 0) / count : 0;
    const avgCa = count ? rows.reduce((s, r) => s + r.player.ca, 0) / count : 0;
    const totalValue = rows.reduce((s, r) => s + r.player.value, 0);
    const wages = world.contracts
      .filter(c => c.clubId === currentClub().id)
      .reduce((s, c) => s + c.wage, 0);
    const finance = world.finances.find(f => f.clubId === currentClub().id);
    const budget = finance?.transferBudget ?? currentClub().budgetTransfer;
    const injured = rows.filter(r => r.injured).length;

    summary.replaceChildren(
      ...summaryPair('Joueurs', String(count)),
      ...summaryPair('Âge moyen', `${formatOne(avgAge)} ans`),
      ...summaryPair('CA moyen', formatOne(avgCa)),
      ...summaryPair('Valeur totale', formatMoney(totalValue)),
      ...summaryPair('Masse salariale', `${formatMoney(wages)} / sem.`),
      ...summaryPair('Budget transferts', formatMoney(budget)),
      ...summaryPair('Blessés', `${injured} sur ${count}`),
    );
  }

  function summaryPair(label: string, value: string): HTMLElement[] {
    return [pair('dt', label), pair('dd', value)];
  }

  /* ---------------------------------------------------- rendu filtres */

  function renderFilters(): void {
    const rows = squadRows();
    const counts = new Map<GroupKey, number>();
    for (const r of rows) counts.set(r.poste.group, (counts.get(r.poste.group) ?? 0) + 1);

    const chips: HTMLElement[] = [];
    const all = chip('Tous', 'ALL', rows.length);
    chips.push(all);
    for (const g of GROUP_ORDER) {
      chips.push(chip(GROUP_LABEL[g], g, counts.get(g) ?? 0));
    }
    filters.replaceChildren(...chips);
  }

  function chip(label: string, value: GroupKey | 'ALL', count: number): HTMLElement {
    const node = el('button', { class: 'club-chip' });
    node.type = 'button';
    node.setAttribute('aria-pressed', String(groupFilter === value));
    node.appendChild(document.createTextNode(label));
    const badge = el('span', { class: 'chip-count', text: String(count) });
    node.appendChild(badge);
    node.addEventListener('click', () => {
      groupFilter = value;
      renderFilters();
      renderRows();
    });
    return node;
  }

  /* ------------------------------------------------- rendu en-têtes col */

  function renderHeadRow(): void {
    const cells: HTMLElement[] = [];

    for (const col of COLUMNS) {
      const th = el('th', { class: col.cls });
      th.scope = 'col';

      if (!col.sortable) {
        th.appendChild(el('span', { class: 'club-sort', text: col.head }));
        cells.push(th);
        continue;
      }

      const isActive = sort.key === col.key;
      const btn = el('button', { class: 'club-sort' });
      btn.type = 'button';
      btn.appendChild(document.createTextNode(col.head));
      if (isActive) {
        const mark = el('span', { class: 'sort-mark', text: sort.dir === 1 ? '↑' : '↓' });
        btn.appendChild(mark);
        btn.setAttribute('title', `Trié par ${col.head} — cliquer pour inverser`);
      } else {
        btn.setAttribute('title', `Trier par ${col.head}`);
      }
      btn.addEventListener('click', () => {
        if (sort.key === col.key) {
          sort = { key: col.key, dir: sort.dir === 1 ? -1 : 1 };
        } else {
          // Valeurs et capacités : du plus fort au plus faible par défaut.
          sort = { key: col.key, dir: col.key === 'age' || col.key === 'end' ? 1 : -1 };
        }
        renderHeadRow();
        renderRows();
      });

      th.appendChild(btn);
      th.setAttribute('aria-sort', isActive ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      cells.push(th);
    }

    const tr = el('tr');
    tr.append(...cells);
    thead.replaceChildren(tr);
  }

  /* ------------------------------------------------------- rendu lignes */

  type BadgeLevel = 'ok' | 'warn' | 'bad' | 'out' | 'good' | 'info';

  function badge(level: BadgeLevel, text: string): HTMLElement {
    const node = el('span', { class: `club-badge badge-${level}`, text });
    return node;
  }

  function renderRows(): void {
    const buckets = groupedRows();
    const fragments: HTMLElement[] = [];

    for (const bucket of buckets) {
      const groupRow = el('tr', { class: 'club-group' });
      const td = el('td', {});
      td.colSpan = COLUMNS.length;
      td.appendChild(document.createTextNode(GROUP_LABEL[bucket.group]));
      td.appendChild(
        el('span', {
          class: 'group-count',
          text: `${bucket.rows.length} joueur${bucket.rows.length > 1 ? 's' : ''}`,
        }),
      );
      groupRow.appendChild(td);
      fragments.push(groupRow);

      for (const row of bucket.rows) fragments.push(buildRow(row));
    }

    if (buckets.length === 0) {
      const empty = el('tr', { class: 'club-empty' });
      const td = el('td', { text: 'Aucun joueur ne correspond à ce filtre.' });
      td.colSpan = COLUMNS.length;
      empty.appendChild(td);
      fragments.push(empty);
    }

    tbody.replaceChildren(...fragments);
  }

  function buildRow(row: SquadRow): HTMLElement {
    const p = row.player;
    const tr = el('tr', { class: 'club-row' });
    tr.tabIndex = 0;
    tr.dataset.playerId = String(p.id);
    if (row.player.id === selectedPlayerId) tr.classList.add('is-selected');
    if (row.injured) tr.classList.add('is-injured');

    // Nom : initiale + nom. Le prénom complet reste dans l'infobulle.
    const nameCell = el('td', { class: 'col-name' });
    const nameText = el('span', {
      class: 'club-name-txt club-num',
      text: `${p.firstName.charAt(0)}. ${p.lastName}`,
    });
    nameText.title = `${p.firstName} ${p.lastName} — ${row.poste.long}`;
    nameCell.appendChild(nameText);
    if (row.injured) {
      nameCell.appendChild(el('span', { text: ' ' }));
      nameCell.appendChild(badge('out', 'Blessé'));
    }

    const posteCell = el('td', { class: 'col-post' });
    posteCell.appendChild(el('span', { class: 'club-post', text: row.poste.label }));

    const cells: Record<string, HTMLElement> = {
      age: cell('col-age', String(row.age)),
      ca: cell('col-ca', String(p.ca)),
      pa: cell('col-pa', String(p.pa)),
      value: cell('col-value', formatMoney(p.value)),
      morale: cell('col-morale', moraleLabel(p.morale)),
      fitness: cell('col-fitness', fitnessLabel(p.fitness)),
      end: cell('col-end', row.contract ? formatDate(row.contract.end) : '—'),
    };

    // La couleur ne porte jamais seule l'information : les niveaux faibles
    // sont badgés avec leur texte.
    const moraleLevelValue = moraleLevel(p.morale);
    if (moraleLevelValue !== 'ok') {
      cells.morale.replaceChildren(badge(moraleLevelValue, moraleLabel(p.morale)));
    }
    const fitLevel = fitnessLevel(p.fitness);
    if (fitLevel !== 'ok') {
      cells.fitness.replaceChildren(badge(fitLevel, fitnessLabel(p.fitness)));
    }
    if (p.ca >= 150) cells.ca.replaceChildren(badge('good', String(p.ca)));
    if (p.pa >= 170) cells.pa.replaceChildren(badge('good', String(p.pa)));

    const statusCell = el('td', { class: 'col-status' });
    statusCell.appendChild(
      el('span', {
        class: 'club-badge badge-info',
        text: STATUS_LABEL[p.squadStatus],
      }),
    );

    tr.append(
      nameCell,
      posteCell,
      cells.age,
      cells.ca,
      cells.pa,
      cells.value,
      cells.morale,
      cells.fitness,
      cells.end,
      statusCell,
    );

    tr.addEventListener('click', () => select(p.id));
    tr.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(p.id);
      }
    });

    return tr;
  }

  function cell(cls: string, text: string): HTMLElement {
    const td = el('td', { class: cls });
    td.appendChild(el('span', { class: 'club-num', text }));
    return td;
  }

  /* ---------------------------------------------------------- sélection */

  function select(playerId: number | null): void {
    selectedPlayerId = playerId;
    renderRows();
    renderDrawer();
  }

  function renderDrawer(): void {
    if (selectedPlayerId === null) {
      drawer.hidden = true;
      layout.classList.remove('is-open');
      drawer.replaceChildren();
      return;
    }

    const row = squadRows().find(r => r.player.id === selectedPlayerId);
    if (!row) {
      select(null);
      return;
    }

    drawer.hidden = false;
    layout.classList.add('is-open');
    drawer.replaceChildren();

    const p = row.player;

    const close = el('button', { class: 'club-close', text: '×' });
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer la fiche du joueur');
    close.addEventListener('click', () => select(null));

    const title = el('h2', {
      class: 'club-drawer-name',
      text: `${p.firstName} ${p.lastName}`,
    });
    const role = el('p', {
      class: 'club-drawer-role',
      text: `${row.poste.label} — ${row.poste.long} · ${countryName(p.nationalityId)}`,
    });

    const drawerHead = el('div', { class: 'club-drawer-head' });
    const headText = el('div', {});
    headText.append(title, role);
    drawerHead.append(headText, close);
    drawer.appendChild(drawerHead);

    const body = el('div', { class: 'club-drawer-body' });

    body.appendChild(attrRow('Capacité actuelle', p.ca, 200, true, `${p.ca} / 200`));
    body.appendChild(attrRow('Potentiel', p.pa, 200, true, `${p.pa} / 200`));
    body.appendChild(attrRow('Moral', p.morale, 100, false, moraleLabel(p.morale)));
    body.appendChild(attrRow('Condition', p.fitness, 100, false, fitnessLabel(p.fitness)));

    const facts = el('dl', { class: 'club-facts' });
    facts.append(
      ...fact('Âge', `${row.age} ans`),
      ...fact('Né en', String(p.birthYear)),
      ...fact('Valeur', formatMoney(p.value)),
      ...fact('Statut', STATUS_LABEL[p.squadStatus]),
      ...fact('Salaire', row.contract ? `${formatMoney(row.contract.wage)} / sem.` : '—'),
      ...fact(
        'Fin de contrat',
        row.contract ? formatDate(row.contract.end) : '—',
      ),
      ...fact(
        'Clause de départ',
        row.contract && row.contract.releaseClause > 0
          ? formatMoney(row.contract.releaseClause)
          : 'Aucune',
      ),
      ...fact(
        'Année en option',
        row.contract?.optionYear ? 'Oui' : 'Non',
      ),
    );
    body.appendChild(facts);

    if (row.injury && row.injury.expectedReturn) {
      const note = el('p', { class: 'club-drawer-note' });
      note.appendChild(el('strong', { text: 'Blessure en cours. ' }));
      note.appendChild(
        document.createTextNode(
          `${row.injury.type} (blessure ${SEVERITY_LABEL[row.injury.severity]}), ` +
            `retour prévu le ${formatDate(row.injury.expectedReturn)}.`,
        ),
      );
      body.appendChild(note);
    }

    drawer.appendChild(body);
  }

  function attrRow(
    label: string,
    value: number,
    max: number,
    key: boolean,
    display: string,
  ): HTMLElement {
    const wrapper = el('div', { class: 'club-attr' });
    const row = el('div', { class: 'club-attr-row' });
    row.append(el('dt', { text: label }), el('dd', { text: display }));

    const track = el('div', { class: key ? 'club-bar is-key' : 'club-bar' });
    const fill = el('i');
    fill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    track.appendChild(fill);

    wrapper.append(row, track);
    return wrapper;
  }

  function fact(label: string, value: string): HTMLElement[] {
    return [pair('dt', label), pair('dd', value)];
  }

  /* ------------------------------------------------------------ clavier */

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && selectedPlayerId !== null) {
      event.preventDefault();
      select(null);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const rows = flatRows();
    if (rows.length === 0) return;
    const index = rows.findIndex(r => r.player.id === selectedPlayerId);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = index === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, index + step));
    const target = rows[nextIndex];
    if (!target) return;

    event.preventDefault();
    select(target.player.id);
    const node = tbody.querySelector<HTMLElement>(`tr[data-player-id="${target.player.id}"]`);
    node?.focus();
    // Garde-fou : tous les environnements n'implémentent pas scrollIntoView.
    node?.scrollIntoView?.({ block: 'nearest' });
  }

  root.addEventListener('keydown', onKeyDown);

  /* ------------------------------------------------------------ rendu */

  function renderAll(): void {
    renderHead();
    renderFilters();
    renderSummary();
    renderHeadRow();
    renderRows();
    renderDrawer();
  }

  renderAll();

  return {
    element: root,
    update: () => renderAll(),
    get selectedPlayerId() {
      return selectedPlayerId;
    },
    nextClub,
    destroy: () => {
      root.removeEventListener('keydown', onKeyDown);
      root.replaceChildren();
    },
  };
}
