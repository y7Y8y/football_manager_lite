/**
 * Construction de la scène Three.js : terrain, lignes, buts, lumières,
 * caméras. Ce module ne fait aucun rendu ni animation (c'est renderer.ts).
 *
 * Tout est construit à partir de géométries procédurales simples : aucune
 * texture ni modèle externe à charger, donc rien à télécharger et rien qui
 * puisse échouer hors ligne.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PITCH, PITCH_BOUNDS, PLAYER_COUNT } from '../core/pitch';

export type CameraView = 'broadcast' | 'tactical';

export interface PitchScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** 22 instances ; la mise à jour des matrices est faite par le renderer. */
  players: THREE.InstancedMesh;
  ball: THREE.Mesh;
  sun: THREE.DirectionalLight;
  setView(view: CameraView): void;
  dispose(): void;
}

const BROADCAST_POSITION = new THREE.Vector3(0, 38, 62);
const TACTICAL_POSITION = new THREE.Vector3(0, 82, 0.01);

function pushSegment(
  points: number[],
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): void {
  const y = 0.03;
  points.push(x1, y, z1, x2, y, z2);
}

function pushArc(
  points: number[],
  cx: number,
  cz: number,
  radius: number,
  from: number,
  to: number,
  steps = 48,
): void {
  for (let i = 0; i < steps; i += 1) {
    const a0 = from + ((to - from) * i) / steps;
    const a1 = from + ((to - from) * (i + 1)) / steps;
    pushSegment(
      points,
      cx + Math.cos(a0) * radius,
      cz + Math.sin(a0) * radius,
      cx + Math.cos(a1) * radius,
      cz + Math.sin(a1) * radius,
    );
  }
}

/** Toutes les lignes du terrain, en un seul objet LineSegments. */
function buildPitchLines(): THREE.LineSegments {
  const points: number[] = [];
  const { minX, maxX, minZ, maxZ } = PITCH_BOUNDS;

  // Touches et lignes de but.
  pushSegment(points, minX, minZ, maxX, minZ);
  pushSegment(points, minX, maxZ, maxX, maxZ);
  pushSegment(points, minX, minZ, minX, maxZ);
  pushSegment(points, maxX, minZ, maxX, maxZ);

  // Ligne médiane et cercle central.
  pushSegment(points, 0, minZ, 0, maxZ);
  pushArc(points, 0, 0, PITCH.centerCircleRadius, 0, Math.PI * 2);

  for (const side of [-1, 1]) {
    const goalLineX = side * maxX;
    const penaltyX = side * (maxX - PITCH.penaltyAreaDepth);
    const goalAreaX = side * (maxX - PITCH.goalAreaDepth);

    // Surface de réparation.
    pushSegment(points, goalLineX, -PITCH.penaltyAreaWidth / 2, penaltyX, -PITCH.penaltyAreaWidth / 2);
    pushSegment(points, goalLineX, PITCH.penaltyAreaWidth / 2, penaltyX, PITCH.penaltyAreaWidth / 2);
    pushSegment(points, penaltyX, -PITCH.penaltyAreaWidth / 2, penaltyX, PITCH.penaltyAreaWidth / 2);

    // Surface de but.
    pushSegment(points, goalLineX, -PITCH.goalAreaWidth / 2, goalAreaX, -PITCH.goalAreaWidth / 2);
    pushSegment(points, goalLineX, PITCH.goalAreaWidth / 2, goalAreaX, PITCH.goalAreaWidth / 2);
    pushSegment(points, goalAreaX, -PITCH.goalAreaWidth / 2, goalAreaX, PITCH.goalAreaWidth / 2);

    // Point de penalty (petite croix).
    const spotX = side * (maxX - PITCH.penaltySpot);
    pushSegment(points, spotX - 0.4, 0, spotX + 0.4, 0);
    pushSegment(points, spotX, -0.4, spotX, 0.4);
  }

  // arcs de coin, orientés vers l'intérieur du terrain.
  pushArc(points, maxX, maxZ, PITCH.cornerArcRadius, Math.PI, 1.5 * Math.PI);
  pushArc(points, maxX, minZ, PITCH.cornerArcRadius, 1.5 * Math.PI, 2 * Math.PI);
  pushArc(points, minX, minZ, PITCH.cornerArcRadius, 0, 0.5 * Math.PI);
  pushArc(points, minX, maxZ, PITCH.cornerArcRadius, 0.5 * Math.PI, Math.PI);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
  });

  return new THREE.LineSegments(geometry, material);
}

function buildPitch(): THREE.Group {
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length, PITCH.width),
    new THREE.MeshStandardMaterial({ color: 0x1c6b33, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Bandes de tonte alternées : pas de texture, juste des plans colorés.
  const stripes = 8;
  const stripeWidth = PITCH.width / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.length, stripeWidth),
      new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x1c6b33 : 0x22793a,
        roughness: 1,
        metalness: 0,
      }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.004, PITCH_BOUNDS.minZ + stripeWidth * (i + 0.5));
    stripe.receiveShadow = true;
    group.add(stripe);
  }

  group.add(buildPitchLines());

  return group;
}

function buildGoals(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const postGeometry = new THREE.BoxGeometry(0.12, PITCH.goalHeight, 0.12);
  const barGeometry = new THREE.BoxGeometry(0.12, 0.12, PITCH.goalWidth + 0.12);

  for (const side of [-1, 1]) {
    const x = side * (PITCH_BOUNDS.maxX + PITCH.goalDepth / 2);

    for (const postSide of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, material);
      post.position.set(x, PITCH.goalHeight / 2, (postSide * PITCH.goalWidth) / 2);
      post.castShadow = true;
      group.add(post);
    }

    const bar = new THREE.Mesh(barGeometry, material);
    bar.position.set(x, PITCH.goalHeight, 0);
    bar.castShadow = true;
    group.add(bar);
  }

  return group;
}

export function createPitchScene(aspect: number, domElement: HTMLElement): PitchScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d18);

  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 600);
  camera.position.copy(BROADCAST_POSITION);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 25;
  controls.maxDistance = 170;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  scene.add(buildPitch());
  scene.add(buildGoals());

  const hemisphere = new THREE.HemisphereLight(0xbdd7ff, 0x14361c, 1.1);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(45, 70, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // 22 joueurs en un seul InstancedMesh : 1 appel de dessin pour tous.
  const playerGeometry = new THREE.CapsuleGeometry(0.34, 0.86, 4, 10);
  const playerMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
  const players = new THREE.InstancedMesh(playerGeometry, playerMaterial, PLAYER_COUNT);
  players.castShadow = true;
  players.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  players.frustumCulled = false;
  scene.add(players);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
  );
  ball.castShadow = true;
  scene.add(ball);

  const setView = (view: CameraView): void => {
    const target = view === 'tactical' ? TACTICAL_POSITION : BROADCAST_POSITION;
    camera.position.copy(target);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  const dispose = (): void => {
    controls.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
  };

  return { scene, camera, controls, players, ball, sun, setView, dispose };
}
