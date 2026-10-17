/**
 * Amorçage de l'application et navigation entre les deux vues.
 *
 * Point d'entrée unique : tout le reste est chargé en modules ES.
 */

import './styles.css';
import { metrics, patchMetrics } from './app/metrics';
import { generateWorld } from './data/generate';
import type { World } from './data/types';
import { MatchRuntime } from './core/runtime';
import { createClubView, type ClubViewHandle } from './ui/club';
import { createDashboard, type DashboardHandle } from './ui/dashboard';
import { mountMatchView, type MatchViewHandle } from './ui/matchView';
import { el } from './ui/dom';

const SEED = 20261017;

const runtime = new MatchRuntime(SEED);
patchMetrics({ seed: SEED });

/**
 * Monde de jeu généré localement, sans aucune donnée réelle (doc 26, phase 1).
 * Une graine fixe donne toujours le même monde : c'est ce qui rend les tests
 * et les parties reproductibles.
 */
const world: World = generateWorld({ seed: SEED });

const clubView: ClubViewHandle = createClubView({ world });

const app = document.querySelector<HTMLElement>('#app');
if (!app) {
  throw new Error('Élément #app introuvable dans index.html');
}

const brand = el('div', { class: 'brand' });
brand.appendChild(el('span', { class: 'brand-mark', text: 'FML' }));
brand.appendChild(el('span', { class: 'brand-name', text: 'Football Manager Lite' }));

const nav = el('nav', { class: 'nav' });
const clubButton = el('button', { class: 'nav-btn is-active', text: 'Effectif' });
const dashboardButton = el('button', { class: 'nav-btn', text: 'Tableau de bord' });
const matchButton = el('button', { class: 'nav-btn', text: 'Match' });
clubButton.type = 'button';
dashboardButton.type = 'button';
matchButton.type = 'button';
nav.append(clubButton, dashboardButton, matchButton);

const header = el('header', { class: 'topbar' });
header.append(brand, nav);

const content = el('main', { class: 'content' });

const dashboard: DashboardHandle = createDashboard(() => showView('match'));
let matchView: MatchViewHandle | null = null;

content.appendChild(clubView.element);
content.appendChild(dashboard.element);

function showView(view: 'club' | 'dashboard' | 'match'): void {
  clubButton.classList.toggle('is-active', view === 'club');
  dashboardButton.classList.toggle('is-active', view === 'dashboard');
  matchButton.classList.toggle('is-active', view === 'match');
  clubView.element.classList.toggle('is-hidden', view !== 'club');
  dashboard.element.classList.toggle('is-hidden', view !== 'dashboard');

  if (view === 'match') {
    if (!matchView) {
      matchView = mountMatchView(runtime);
      content.appendChild(matchView.element);
    }
    matchView.element.classList.remove('is-hidden');
  } else if (matchView) {
    matchView.element.classList.add('is-hidden');
  }
}

clubButton.addEventListener('click', () => showView('club'));
dashboardButton.addEventListener('click', () => showView('dashboard'));
matchButton.addEventListener('click', () => showView('match'));

app.append(header, content);

// Vue d'ouverture : l'effectif du club (critère de sortie de la phase 1).
showView('club');

/**
 * Boucle de rafraîchissement de l'interface (500 ms).
 * Elle lit l'état partagé ; elle ne calcule rien elle-même.
 */
const REFRESH_MS = 500;
window.setInterval(() => {
  metrics.tick = runtime.state.tick;
  metrics.minute = Math.floor(runtime.state.time / 60);
  clubView.update();
  dashboard.update();
}, REFRESH_MS);

clubView.update();
dashboard.update();

// Signal de démarrage utile dans les logs du serveur de dev.
console.info(
  `[FMT-1] monde prêt — graine ${SEED}, ${world.clubs.length} clubs, ` +
    `${world.players.length} joueurs, ${world.fixtures.length} matchs au calendrier ; ` +
    `WebGL2 : ${metrics.webgl2 === null ? 'non testé' : String(metrics.webgl2)}`,
);
