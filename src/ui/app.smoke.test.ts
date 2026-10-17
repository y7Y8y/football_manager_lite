// @vitest-environment jsdom
/**
 * Test de fumée de l'interface.
 *
 * Il n'y a PAS de navigateur ni de GPU dans le sandbox : jsdom ne fournit pas
 * de contexte WebGL2. Ce test vérifie donc le chemin de repli, et surtout que
 * l'application démarre, monte ses deux vues et navigue entre elles sans
 * lever d'exception. Le rendu 3D réel ne peut être validé que dans le
 * navigateur de l'utilisateur.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

  document.body.innerHTML = '<div id="app"></div>';

  // jsdom n'implémente pas getContext : on neutralise les avertissements.
  const canvas = document.createElement('canvas');
  const originalGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = ((type: string) => {
    if (type === '2d' || type === 'webgl2') return null;
    return originalGetContext(type);
  }) as typeof canvas.getContext;

  vi.useFakeTimers();
});

describe('démarrage de l’application', () => {
  it('monte la barre de navigation et le tableau de bord', async () => {
    await import('../main');

    const navButtons = document.querySelectorAll('.nav-btn');
    expect(navButtons).toHaveLength(2);
    expect(navButtons[0].textContent).toBe('Tableau de bord');
    expect(navButtons[1].textContent).toBe('Match');

    const dashboard = document.querySelector('#view-dashboard');
    expect(dashboard).not.toBeNull();
    expect(dashboard?.classList.contains('is-hidden')).toBe(false);

    // 4 cartes de mesures, avec des valeurs issues du store de mesures.
    const cards = document.querySelectorAll('#view-dashboard .card');
    expect(cards).toHaveLength(4);
    expect(document.querySelector('#view-dashboard .card-value')?.textContent).toBe('20261017');
  });

  it('bascule sur la vue match et déclenche le repli 2D faute de WebGL2', async () => {
    const matchButton = document.querySelectorAll<HTMLButtonElement>('.nav-btn')[1];
    matchButton.click();

    const matchView = document.querySelector('#view-match');
    expect(matchView).not.toBeNull();
    expect(matchView?.classList.contains('is-hidden')).toBe(false);
    expect(document.querySelector('#view-dashboard')?.classList.contains('is-hidden')).toBe(true);

    // Sans WebGL2, la vue tactique de repli doit être signalée.
    expect(matchView?.classList.contains('view-fallback')).toBe(true);
    expect(document.querySelector('.stage-canvas')).not.toBeNull();

    const hudItems = document.querySelectorAll('.hud-item');
    expect(hudItems).toHaveLength(4);

    const toolbarButtons = document.querySelectorAll('.toolbar .btn');
    expect(toolbarButtons).toHaveLength(4);

    // Retour au tableau de bord.
    document.querySelectorAll<HTMLButtonElement>('.nav-btn')[0].click();
    expect(document.querySelector('#view-dashboard')?.classList.contains('is-hidden')).toBe(false);
    expect(document.querySelector('#view-match')?.classList.contains('is-hidden')).toBe(true);
  });
});
