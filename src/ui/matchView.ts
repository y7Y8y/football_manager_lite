/**
 * Écran « Match » : terrain 3D, HUD de mesure et solution de repli.
 *
 * Le HUD expose les valeurs nécessaires pour mesurer les performances sur le
 * PC de l'utilisateur, ce que le sandbox ne peut pas faire.
 */

import { metrics, patchMetrics } from '../app/metrics';
import type { MatchRuntime } from '../core/runtime';
import { probeWebGL2 } from '../match3d/detect';
import { createFallbackView, type FallbackHandle } from '../match3d/fallback';
import { createMatchRenderer, type MatchRendererHandle } from '../match3d/renderer';
import type { CameraView } from '../match3d/scene';
import { button, el } from './dom';

type Visualization = MatchRendererHandle | FallbackHandle;

export interface MatchViewHandle {
  element: HTMLElement;
  dispose: () => void;
}

interface Hud {
  fps: HTMLElement;
  drawCalls: HTMLElement;
  triangles: HTMLElement;
  resolution: HTMLElement;
}

function buildHud(): { element: HTMLElement; hud: Hud } {
  const entries: Array<[keyof Hud, string]> = [
    ['fps', 'FPS'],
    ['drawCalls', 'Appels de dessin'],
    ['triangles', 'Triangles'],
    ['resolution', 'Résolution'],
  ];

  const hud = {} as Hud;
  const element = el('div', { class: 'hud' });

  for (const [key, label] of entries) {
    const value = el('span', { class: 'hud-value', text: '—' });
    const item = el('div', { class: 'hud-item' });
    item.appendChild(el('span', { class: 'hud-label', text: label }));
    item.appendChild(value);
    element.appendChild(item);
    hud[key] = value;
  }

  return { element, hud };
}

export function mountMatchView(runtime: MatchRuntime): MatchViewHandle {
  const root = el('section', { class: 'view', id: 'view-match' });
  root.dataset.view = 'match';

  const probe = probeWebGL2();
  patchMetrics({
    webgl2: probe.available,
    gpuVendor: probe.vendor,
    gpuRenderer: probe.renderer,
    fallbackActive: !probe.available,
  });

  if (!probe.available) {
    root.classList.add('view-fallback');
  }

  const toolbar = el('div', { class: 'toolbar' });

  let visualization: Visualization | null = null;

  const goTo = (view: CameraView): void => visualization?.setView(view);

  const shadows = button('Ombres : activées', () => {
    const enabled = !metrics.shadowsEnabled;
    patchMetrics({ shadowsEnabled: enabled });
    visualization?.setShadows(enabled);
    shadows.textContent = `Ombres : ${enabled ? 'activées' : 'désactivées'}`;
  });

  toolbar.append(
    button('Vue large', () => goTo('broadcast')),
    button('Vue tactique', () => goTo('tactical')),
    shadows,
    button('Recentrer la caméra', () => goTo('broadcast')),
  );

  const stage = el('div', { class: 'stage' });
  const canvas = el('canvas', { class: 'stage-canvas' });
  canvas.setAttribute('aria-label', 'Terrain de football');
  stage.appendChild(canvas);

  const { element: hudElement, hud } = buildHud();

  const onStats = (stats: {
    fps: number;
    drawCalls?: number;
    triangles?: number;
    width?: number;
    height?: number;
  }): void => {
    patchMetrics({
      fps: stats.fps,
      drawCalls: stats.drawCalls ?? 0,
      triangles: stats.triangles ?? 0,
      renderWidth: stats.width ?? 0,
      renderHeight: stats.height ?? 0,
    });

    hud.fps.textContent = stats.fps.toFixed(1);
    hud.drawCalls.textContent = stats.drawCalls === undefined ? '—' : String(stats.drawCalls);
    hud.triangles.textContent =
      stats.triangles === undefined ? '—' : stats.triangles.toLocaleString('fr-FR');
    hud.resolution.textContent =
      stats.width === undefined || stats.height === undefined
        ? '—'
        : `${stats.width} × ${stats.height}`;
  };

  if (probe.available) {
    visualization = createMatchRenderer({ canvas, container: stage, runtime, onStats });
  } else {
    visualization = createFallbackView({
      canvas,
      container: stage,
      runtime,
      onStats: (stats) => onStats({ fps: stats.fps }),
    });
  }

  visualization.start();

  const footer = el('p', { class: 'stage-foot' });
  footer.textContent = probe.available
    ? 'Rendu WebGL2 actif. Lis la valeur FPS pendant 30 secondes pour valider le critère de performance.'
    : 'WebGL2 indisponible dans ce navigateur : vue tactique 2D de repli, alimentée par la même simulation.';

  root.append(toolbar, stage, hudElement, footer);

  return {
    element: root,
    dispose: () => {
      visualization?.dispose();
      visualization = null;
    },
  };
}
