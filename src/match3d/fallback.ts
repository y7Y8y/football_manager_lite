/**
 * Vue tactique de repli, en 2D, sur un canvas HTML standard.
 *
 * Elle est utilisée automatiquement quand WebGL2 n'est pas disponible.
 * Elle lit exactement le même état de simulation que le rendu 3D : le jeu
 * reste donc observable même sans accélération graphique.
 */

import { FIXED_TIMESTEP, type MatchRuntime } from '../core/runtime';
import { PITCH, PITCH_BOUNDS, teamColorOf } from '../core/pitch';
import type { CameraView } from './scene';

export interface FallbackOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  runtime: MatchRuntime;
  onStats: (stats: { fps: number }) => void;
}

export interface FallbackHandle {
  start(): void;
  stop(): void;
  setShadows(enabled: boolean): void;
  setView(view: CameraView): void;
  dispose(): void;
}

const PADDING = 6;

export function createFallbackView(options: FallbackOptions): FallbackHandle {
  const { canvas, container, runtime, onStats } = options;
  const context = canvas.getContext('2d');

  let frameId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;
  let frames = 0;
  let statsElapsed = 0;
  let statsLast = 0;

  const resize = (): void => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  };

  /** Convertit des coordonnées terrain (mètres) en pixels CSS. */
  const toPixels = (): { scale: number; offsetX: number; offsetY: number } => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const usableWidth = width - PADDING * 2;
    const usableHeight = height - PADDING * 2;
    const scale = Math.min(usableWidth / PITCH.length, usableHeight / PITCH.width);

    return {
      scale,
      offsetX: (width - PITCH.length * scale) / 2,
      offsetY: (height - PITCH.width * scale) / 2,
    };
  };

  const draw = (): void => {
    if (!context) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const { scale, offsetX, offsetY } = toPixels();
    const { minX, maxX, minZ, maxZ } = PITCH_BOUNDS;

    const px = (x: number): number => offsetX + (x - minX) * scale;
    const pz = (z: number): number => offsetY + (z - minZ) * scale;

    context.fillStyle = '#0b1220';
    context.fillRect(0, 0, width, height);

    // Pelouse.
    context.fillStyle = '#1c6b33';
    context.fillRect(px(minX), pz(minZ), PITCH.length * scale, PITCH.width * scale);

    // Bandes de tonte.
    const stripes = 8;
    const stripeWidth = (PITCH.width / stripes) * scale;
    for (let i = 0; i < stripes; i += 1) {
      if (i % 2 === 0) continue;
      context.fillStyle = '#22793a';
      context.fillRect(px(minX), pz(minZ) + stripeWidth * i, PITCH.length * scale, stripeWidth);
    }

    // Lignes.
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    context.lineWidth = Math.max(1, scale * 0.12);
    context.strokeRect(px(minX), pz(minZ), PITCH.length * scale, PITCH.width * scale);

    context.beginPath();
    context.moveTo(px(0), pz(minZ));
    context.lineTo(px(0), pz(maxZ));
    context.stroke();

    context.beginPath();
    context.arc(px(0), pz(0), PITCH.centerCircleRadius * scale, 0, Math.PI * 2);
    context.stroke();

    for (const side of [-1, 1]) {
      const goalX = side * maxX;
      const penaltyX = side * (maxX - PITCH.penaltyAreaDepth);
      const goalAreaX = side * (maxX - PITCH.goalAreaDepth);

      context.strokeRect(
        Math.min(px(goalX), px(penaltyX)),
        pz(-PITCH.penaltyAreaWidth / 2),
        PITCH.penaltyAreaDepth * scale,
        PITCH.penaltyAreaWidth * scale,
      );
      context.strokeRect(
        Math.min(px(goalX), px(goalAreaX)),
        pz(-PITCH.goalAreaWidth / 2),
        PITCH.goalAreaDepth * scale,
        PITCH.goalAreaWidth * scale,
      );

      context.beginPath();
      context.arc(px(side * (maxX - PITCH.penaltySpot)), pz(0), Math.max(1.5, scale * 0.1), 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 255, 255, 0.9)';
      context.fill();
    }

    // Joueurs.
    const radius = Math.max(3, scale * 0.45);
    for (const player of runtime.state.players) {
      context.beginPath();
      context.fillStyle = teamColorOf(player.team, player.role);
      context.arc(px(player.x), pz(player.z), radius, 0, Math.PI * 2);
      context.fill();
    }

    // Ballon.
    context.beginPath();
    context.fillStyle = '#ffffff';
    context.arc(px(runtime.state.ball.x), pz(runtime.state.ball.z), Math.max(2, radius * 0.55), 0, Math.PI * 2);
    context.fill();
  };

  const frame = (now: number): void => {
    frameId = requestAnimationFrame(frame);

    if (lastTime === 0) {
      lastTime = now;
      statsLast = now;
    }

    const delta = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;

    accumulator += delta;
    while (accumulator >= FIXED_TIMESTEP) {
      runtime.advance(FIXED_TIMESTEP);
      accumulator -= FIXED_TIMESTEP;
    }

    draw();

    frames += 1;
    statsElapsed = now - statsLast;
    if (statsElapsed >= 500) {
      onStats({ fps: (frames * 1000) / statsElapsed });
      frames = 0;
      statsElapsed = 0;
      statsLast = now;
    }
  };

  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    start(): void {
      if (frameId !== null) return;
      lastTime = 0;
      accumulator = 0;
      frameId = requestAnimationFrame(frame);
    },
    stop(): void {
      if (frameId === null) return;
      cancelAnimationFrame(frameId);
      frameId = null;
    },
    setShadows(): void {
      /* sans objet en 2D */
    },
    setView(): void {
      /* vue unique en 2D */
    },
    dispose(): void {
      this.stop();
      observer.disconnect();
    },
  };
}
