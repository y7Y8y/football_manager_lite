/**
 * Rendu Three.js du match.
 *
 * Le rendu ne possède AUCUNE logique de jeu : il lit l'état produit par
 * MatchRuntime et le recopie dans la scène. C'est la vue, pas le modèle.
 */

import * as THREE from 'three';
import { FIXED_TIMESTEP, type MatchRuntime } from '../core/runtime';
import { teamColorOf } from '../core/pitch';
import { createPitchScene, type CameraView, type PitchScene } from './scene';

export interface RenderStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  width: number;
  height: number;
}

export interface MatchRendererOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  runtime: MatchRuntime;
  onStats: (stats: RenderStats) => void;
}

export interface MatchRendererHandle {
  start(): void;
  stop(): void;
  setShadows(enabled: boolean): void;
  setView(view: CameraView): void;
  dispose(): void;
}

const STATS_INTERVAL_MS = 500;

function applyTeamColors(scene: PitchScene, runtime: MatchRuntime): void {
  const color = new THREE.Color();

  runtime.state.players.forEach((player) => {
    color.set(teamColorOf(player.team, player.role));
    scene.players.setColorAt(player.id, color);
  });

  if (scene.players.instanceColor) {
    scene.players.instanceColor.needsUpdate = true;
  }
}

function forceMaterialUpdate(scene: PitchScene): void {
  // Activer/désactiver shadowMap après compilation oblige Three.js à
  // recompiler les matériaux, sinon le changement n'a aucun effet visible.
  scene.scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      const material = object.material;
      if (Array.isArray(material)) material.forEach((m) => (m.needsUpdate = true));
      else material.needsUpdate = true;
    }
  });
}

export function createMatchRenderer(options: MatchRendererOptions): MatchRendererHandle {
  const { canvas, container, runtime, onStats } = options;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = createPitchScene(1, canvas);
  applyTeamColors(scene, runtime);

  const dummy = new THREE.Object3D();

  const resize = (): void => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    renderer.setSize(width, height, false);
    scene.camera.aspect = width / height;
    scene.camera.updateProjectionMatrix();
  };

  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let frameId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;
  let frames = 0;
  let statsElapsed = 0;
  let statsLast = 0;

  const syncFromSimulation = (): void => {
    const state = runtime.state;

    for (const player of state.players) {
      dummy.position.set(player.x, 0.82, player.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      scene.players.setMatrixAt(player.id, dummy.matrix);
    }
    scene.players.instanceMatrix.needsUpdate = true;

    scene.ball.position.set(state.ball.x, 0.12, state.ball.z);
  };

  const frame = (now: number): void => {
    frameId = requestAnimationFrame(frame);

    if (lastTime === 0) {
      lastTime = now;
      statsLast = now;
    }

    const delta = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;

    // Pas de temps fixe : la simulation avance de façon identique quelle que
    // soit la fréquence d'images réelle.
    accumulator += delta;
    while (accumulator >= FIXED_TIMESTEP) {
      runtime.advance(FIXED_TIMESTEP);
      accumulator -= FIXED_TIMESTEP;
    }

    syncFromSimulation();
    scene.controls.update();
    renderer.render(scene.scene, scene.camera);

    frames += 1;
    statsElapsed = now - statsLast;

    if (statsElapsed >= STATS_INTERVAL_MS) {
      const size = renderer.getSize(new THREE.Vector2());
      onStats({
        fps: (frames * 1000) / statsElapsed,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        width: size.x,
        height: size.y,
      });
      frames = 0;
      statsElapsed = 0;
      statsLast = now;
    }
  };

  return {
    start(): void {
      if (frameId !== null) return;
      lastTime = 0;
      accumulator = 0;
      frames = 0;
      statsLast = 0;
      frameId = requestAnimationFrame(frame);
    },

    stop(): void {
      if (frameId === null) return;
      cancelAnimationFrame(frameId);
      frameId = null;
    },

    setShadows(enabled: boolean): void {
      renderer.shadowMap.enabled = enabled;
      scene.sun.castShadow = enabled;
      forceMaterialUpdate(scene);
    },

    setView(view: CameraView): void {
      scene.setView(view);
    },

    dispose(): void {
      this.stop();
      observer.disconnect();
      scene.dispose();
      renderer.dispose();
    },
  };
}
