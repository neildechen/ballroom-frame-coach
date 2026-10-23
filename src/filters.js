// Signal conditioning: one-euro smoothing for landmark coordinates and a
// time-based latch so faults neither flicker nor fire on single frames.

// Casiez, Roussel & Vogel (2012). t in seconds.
export class OneEuroFilter {
  constructor({ minCutoff = 1.5, beta = 4, dCutoff = 1, maxGap = 0.5 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff, maxGap });
    this.reset();
  }
  reset() {
    this.x = null; this.dx = 0; this.t = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, t) {
    if (this.x === null || t - this.t > this.maxGap || t <= this.t) {
      if (this.x === null || t - this.t > this.maxGap) {
        this.x = value; this.dx = 0; this.t = t;
      }
      return this.x;
    }
    const dt = t - this.t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    this.t = t;
    return this.x;
  }
}

// Smooths x/y of selected landmark indices; other entries pass through.
export class LandmarkSmoother {
  constructor(indices, opts) {
    this.indices = indices;
    this.opts = opts;
    this.filters = new Map();
  }
  reset() {
    this.filters.clear();
  }
  apply(landmarks, tSec) {
    if (!landmarks) {
      this.reset();
      return null;
    }
    const out = landmarks.slice();
    for (const i of this.indices) {
      const lm = landmarks[i];
      if (!lm) continue;
      let f = this.filters.get(i);
      if (!f) this.filters.set(i, (f = [new OneEuroFilter(this.opts), new OneEuroFilter(this.opts)]));
      out[i] = { ...lm, x: f[0].filter(lm.x, tSec), y: f[1].filter(lm.y, tSec) };
    }
    return out;
  }
}

// on turns true once `fault` has held for enterMs; turns false once `clear`
// has held for exitMs. Between the two thresholds the state is kept.
export class Latch {
  constructor({ enterMs = 150, exitMs = 100 } = {}) {
    Object.assign(this, { enterMs, exitMs });
    this.reset();
  }
  reset() {
    this.on = false; this.since = null;
  }
  update(fault, clear, tMs) {
    const pushing = this.on ? clear : fault;
    if (!pushing) {
      this.since = null;
    } else {
      if (this.since === null) this.since = tMs;
      if (tMs - this.since >= (this.on ? this.exitMs : this.enterMs)) {
        this.on = !this.on; this.since = null;
      }
    }
    return this.on;
  }
}
