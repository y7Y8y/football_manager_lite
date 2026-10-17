/**
 * Écran « Tableau de bord » : présentation du prototype et mesures en direct.
 *
 * Toutes les valeurs affichées proviennent du store de mesures, lui-même
 * alimenté par le moteur et le rendu. Rien n'est codé en dur.
 */

import { metrics } from '../app/metrics';
import { PLAYER_COUNT, TEAM_SIZE } from '../core/pitch';
import { el } from './dom';

interface LiveRow {
  label: string;
  read: () => string;
}

interface Card {
  element: HTMLElement;
  update: () => void;
}

function buildCard(title: string, rows: LiveRow[], note?: string): Card {
  const values = rows.map(() => el('span', { class: 'card-value', text: '—' }));

  const list = el('dl', { class: 'card-list' });
  rows.forEach((row, index) => {
    const term = el('dt', { class: 'card-label', text: row.label });
    const description = el('dd', { class: 'card-detail' });
    description.appendChild(values[index]);
    list.appendChild(term);
    list.appendChild(description);
  });

  const body = el('div', { class: 'card-body' });
  body.appendChild(list);
  if (note) body.appendChild(el('p', { class: 'card-note', text: note }));

  const element = el('article', { class: 'card' });
  element.appendChild(el('h2', { class: 'card-title', text: title }));
  element.appendChild(body);

  return {
    element,
    update: () => {
      rows.forEach((row, index) => {
        values[index].textContent = row.read();
      });
    },
  };
}

function webgl2Label(): string {
  if (metrics.webgl2 === null) return 'non testé';
  return metrics.webgl2 ? 'disponible' : 'indisponible';
}

export interface DashboardHandle {
  element: HTMLElement;
  update: () => void;
}

export function createDashboard(onOpenMatch: () => void): DashboardHandle {
  const root = el('section', { class: 'view', id: 'view-dashboard' });

  const header = el('header', { class: 'hero' });
  header.appendChild(el('p', { class: 'kicker', text: 'Prototype FMT-1' }));
  header.appendChild(el('h1', { class: 'hero-title', text: 'Football Manager Lite' }));
  header.appendChild(
    el('p', {
      class: 'hero-subtitle',
      text: 'Validation technique de l’aperçu web : TypeScript + Vite + Three.js, moteur de simulation indépendant du rendu.',
    }),
  );

  const openButton = el('button', { class: 'btn btn-primary', text: 'Ouvrir la vue match' });
  openButton.type = 'button';
  openButton.addEventListener('click', onOpenMatch);
  header.appendChild(openButton);

  root.appendChild(header);

  const cards: Card[] = [
    buildCard(
      'Moteur de simulation',
      [
        { label: 'Graine', read: () => String(metrics.seed) },
        { label: 'Pas de simulation', read: () => metrics.tick.toLocaleString('fr-FR') },
        { label: 'Minute simulée', read: () => String(metrics.minute) },
      ],
      'Avance uniquement quand la vue match est ouverte.',
    ),
    buildCard(
      'Effectif sur le terrain',
      [
        { label: 'Joueurs visibles', read: () => String(PLAYER_COUNT) },
        { label: 'Composition', read: () => `2 × ${TEAM_SIZE}` },
        { label: 'Gardiens', read: () => '2' },
      ],
      'Formation 4-3-3 par équipe, positions calculées dans src/core/pitch.ts.',
    ),
    buildCard(
      'Rendu',
      [
        { label: 'WebGL2', read: webgl2Label },
        { label: 'GPU déclaré', read: () => metrics.gpuRenderer },
        { label: 'FPS', read: () => (metrics.fps > 0 ? metrics.fps.toFixed(1) : '—') },
        { label: 'Appels de dessin', read: () => (metrics.drawCalls > 0 ? String(metrics.drawCalls) : '—') },
        { label: 'Triangles', read: () => (metrics.triangles > 0 ? metrics.triangles.toLocaleString('fr-FR') : '—') },
      ],
      'Mesuré dans ton navigateur : ces valeurs ne peuvent pas l’être dans le sandbox.',
    ),
    buildCard(
      'Repli si WebGL2 manque',
      [
        { label: 'Vue 2D active', read: () => (metrics.fallbackActive ? 'oui' : 'non') },
        { label: 'Contenu affiché', read: () => (metrics.fallbackActive ? 'terrain + 22 joueurs + ballon' : '—') },
      ],
      'Une vue tactique 2D reprend le même état de simulation.',
    ),
  ];

  const grid = el('div', { class: 'card-grid' });
  cards.forEach((card) => grid.appendChild(card.element));
  root.appendChild(grid);

  const hint = el('aside', { class: 'hint' });
  hint.appendChild(el('h2', { class: 'hint-title', text: 'Tester le rechargement à chaud' }));
  hint.appendChild(
    el('p', {
      class: 'hint-text',
      text: 'Modifie le texte de cette page dans src/ui/dashboard.ts, enregistre, et observe l’aperçu : le changement doit apparaître sans rechargement manuel. C’est le critère n° 4 de FMT-1.',
    }),
  );
  root.appendChild(hint);

  return {
    element: root,
    update: () => cards.forEach((card) => card.update()),
  };
}
