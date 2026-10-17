/**
 * Store de mesures partagé entre le rendu 3D et l'interface.
 *
 * Volontairement minimaliste : un objet mutable lu par le tableau de bord.
 * Aucune dépendance, aucun framework.
 */

export interface Metrics {
  seed: number;
  tick: number;
  /** Minute de jeu simulée. */
  minute: number;
  /** null = pas encore testé, true/false = résultat de la sonde WebGL2. */
  webgl2: boolean | null;
  gpuVendor: string;
  gpuRenderer: string;
  fps: number;
  drawCalls: number;
  triangles: number;
  shadowsEnabled: boolean;
  /** Largeur de rendu réelle en pixels CSS. */
  renderWidth: number;
  renderHeight: number;
  /** true si le repli 2D est actif. */
  fallbackActive: boolean;
}

export const metrics: Metrics = {
  seed: 0,
  tick: 0,
  minute: 0,
  webgl2: null,
  gpuVendor: '—',
  gpuRenderer: '—',
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  shadowsEnabled: true,
  renderWidth: 0,
  renderHeight: 0,
  fallbackActive: false,
};

export function patchMetrics(patch: Partial<Metrics>): void {
  Object.assign(metrics, patch);
}
