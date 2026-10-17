/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Il ne dépend d'aucune API du navigateur ni de Node : le même état initial
 * produit toujours la même séquence. C'est ce qui rend la simulation
 * reproductible et testable hors navigateur.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mélange une graine entière en une autre graine entière (SplitMix32). */
export function mixSeed(seed: number): number {
  let z = seed >>> 0;
  z = (z + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}
