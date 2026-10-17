/**
 * Amorçage de l'application et navigation entre les deux vues.
 *
 * Point d'entrée unique : tout le reste est chargé en modules ES.
 */

import './styles.css';
import { metrics, patchMetrics } from './app/metrics';
import { MatchRuntime } from './core/runtime';
import { createDashboard, type DashboardHandle } from './ui/dashboard';
import { mountMatchView, type MatchViewHandle } from './ui/matchView';
import { el } from './ui/dom';

const SEED = 20261017;

const runtime = new MatchRuntime(SEED);
patchMetrics({ seed: SEED });

const app = document.querySelector<HTMLElement>('#app');
if (!app) {
  throw new Error('Élément #app introuvable dans index.html');
}

const brand = el('div', { class: 'brand' });
brand.appendChild(el('span', { class: 'brand-mark', text: 'FML' }));
brand.appendChild(el('span', { class: 'brand-name', text: 'Football Manager Lite' }));

const nav = el('nav', { class: 'nav' });
const dashboardButton = el('button', { class: 'nav-btn is-active', text: 'Tableau de bord' });
const matchButton = el('button', { class: 'nav-btn', text: 'Match' });
dashboardButton.type = 'button';
matchButton.type = 'button';
nav.append(dashboardButton, matchButton);

const header = el('header', { class: 'topbar' });
header.append(brand, nav);

const content = el('main', { class: 'content' });

const dashboard: DashboardHandle = createDashboard(() => showView('match'));
let matchView: MatchViewHandle | null = null;

content.appendChild(dashboard.element);

function showView(view: 'dashboard' | 'match'): void {
  const isMatch = view === 'match';

  dashboardButton.classList.toggle('is-active', !isMatch);
  matchButton.classList.toggle('is-active', isMatch);
  dashboard.element.classList.toggle('is-hidden', isMatch);

  if (isMatch) {
    if (!matchView) {
      matchView = mountMatchView(runtime);
      content.appendChild(matchView.element);
    }
    matchView.element.classList.remove('is-hidden');
  } else if (matchView) {
    matchView.element.classList.add('is-hidden');
  }
}

dashboardButton.addEventListener('click', () => showView('dashboard'));
matchButton.addEventListener('click', () => showView('match'));

app.append(header, content);

/**
 * Boucle de rafraîchissement de l'interface (500 ms).
 * Elle lit l'état partagé ; elle ne calcule rien elle-même.
 */
const REFRESH_MS = 500;
window.setInterval(() => {
  metrics.tick = runtime.state.tick;
  metrics.minute = Math.floor(runtime.state.time / 60);
  dashboard.update();
}, REFRESH_MS);

dashboard.update();

// Signal de démarrage utile dans les logs du serveur de dev.
console.info(
  `[FMT-1] moteur prêt — graine ${SEED}, WebGL2 : ${metrics.webgl2 === null ? 'non testé' : String(metrics.webgl2)}`,
);
