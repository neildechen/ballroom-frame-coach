// Test helpers. The dancer generator itself lives in src/synthetic.js so the
// in-app demo draws exactly what the tests check.

export { makeDancer, DEFAULT_DANCER } from '../src/synthetic.js';

// Image-space angle (deg, counter-clockwise from the image's +x axis, y up)
// of the segment a -> b given normalized landmarks. Used to check fixtures
// against the user's literal description.
export function imageAngle(a, b, aspect) {
  const dx = (b.x - a.x) * aspect;
  const dy = -(b.y - a.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Small seeded PRNG so property tests are reproducible.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
