/**
 * Randomness for the simulator, injectable so tests can pin it.
 *
 * numpy gave the Python `standard_normal` and a seedable global; the browser has
 * neither. This supplies both, and every consumer takes an Rng rather than
 * reaching for Math.random, which is what makes the simulator testable at all.
 */

export interface Rng {
  /** Uniform in [0, 1), like Math.random and Python's random.random. */
  next(): number;
  /** Standard normal, mean 0 and variance 1, like numpy.random.standard_normal. */
  normal(): number;
}

/**
 * Box-Muller transform. Draws come in pairs, so one is cached for the next call.
 *
 * u must not be 0 or log(0) is -Infinity, so a zero draw is retried. Math.random
 * can return exactly 0 and over millions of ticks it eventually will.
 */
function makeNormal(uniform: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = uniform();
    while (u === 0) u = uniform();
    const v = uniform();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
}

/** The real thing: Math.random underneath. */
export function browserRng(): Rng {
  const normal = makeNormal(Math.random);
  return { next: Math.random, normal };
}

/**
 * Deterministic Rng for tests, using mulberry32.
 *
 * Small, fast and good enough for a price toy - this is not cryptography and
 * not a statistical study. It exists so a test can assert an exact sequence.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next: uniform, normal: makeNormal(uniform) };
}
