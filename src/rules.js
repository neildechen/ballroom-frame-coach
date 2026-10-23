// Raw measurements -> instantaneous fault/clear signals. Timing (how long a
// fault must persist) lives in session.js.

export const DEFAULT_TOLERANCES = Object.freeze({
  frameDeg: 3, // a side may sit this far below body-horizontal before it counts as dropping
  shoulderDeg: 4, // shoulder line vs body-horizontal (full mode only)
  headRollDeg: 5, // head tilt vs body-horizontal
  headOffset: 0.4, // head centre vs the body axis through the shoulder midpoint, fraction of half the shoulder width
  hysteresisDeg: 1, // a fault clears only once this far back inside its tolerance
  hysteresisOffset: 0.08,
});

const none = (value = null) => ({ value, fault: false, clear: true, dir: null });

// Fault when value < -tol; clear when value > -(tol - hyst).
function below(value, tol, hyst) {
  if (value == null) return none();
  return { value, fault: value < -tol, clear: value > -(tol - hyst), dir: null };
}

// Fault when |value| > tol; dir names the side by sign.
function magnitude(value, tol, hyst, posDir, negDir) {
  if (value == null) return none();
  const a = Math.abs(value);
  return { value, fault: a > tol, clear: a < tol - hyst, dir: value >= 0 ? posDir : negDir };
}

export function evaluate(m, tolerances = {}) {
  const t = { ...DEFAULT_TOLERANCES, ...tolerances };
  const hd = Math.min(t.hysteresisDeg, t.frameDeg);
  return {
    leftDrop: below(m.elevL, t.frameDeg, hd),
    rightDrop: below(m.elevR, t.frameDeg, hd),
    // + tilt = left shoulder higher, so the right side is the low one
    shoulder: magnitude(m.shoulderTilt, t.shoulderDeg, t.hysteresisDeg, 'right', 'left'),
    // + roll = left side of the face higher = head leaning to the dancer's right
    headTilt: magnitude(m.headRoll, t.headRollDeg, t.hysteresisDeg, 'right', 'left'),
    // + offset = toward the dancer's left
    headShift: magnitude(m.headOffset, t.headOffset, t.hysteresisOffset, 'left', 'right'),
  };
}
