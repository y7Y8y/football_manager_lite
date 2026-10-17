/**
 * Sonde de capacités WebGL2.
 *
 * Important : la sonde utilise un canvas JETABLE, distinct du canvas de rendu.
 * Un navigateur ne peut fournir qu'un seul contexte par canvas ; sonder le
 * canvas de rendu empêcherait Three.js d'y créer son contexte.
 */

export interface WebGL2Probe {
  available: boolean;
  vendor: string;
  renderer: string;
  /** Version WebGL rapportée par le navigateur. */
  version: string;
}

const UNKNOWN = 'non communiqué';

export function probeWebGL2(): WebGL2Probe {
  if (typeof document === 'undefined') {
    return { available: false, vendor: UNKNOWN, renderer: UNKNOWN, version: UNKNOWN };
  }

  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');

  if (!gl) {
    return { available: false, vendor: UNKNOWN, renderer: UNKNOWN, version: UNKNOWN };
  }

  let vendor = UNKNOWN;
  let renderer = UNKNOWN;

  // WEBGL_debug_renderer_info est masquée par certains navigateurs pour des
  // raisons de confidentialité : on se rabat alors sur les valeurs génériques.
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
    renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
  } else {
    vendor = String(gl.getParameter(gl.VENDOR));
    renderer = String(gl.getParameter(gl.RENDERER));
  }

  const version = String(gl.getParameter(gl.VERSION));

  // On libère immédiatement le contexte jetable.
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return { available: true, vendor, renderer, version };
}
