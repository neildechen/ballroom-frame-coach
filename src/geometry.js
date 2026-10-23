// Pure 2D geometry. World coordinates: x right, y UP, both in units of image
// height (normalized landmarks are aspect-corrected by toWorld before any angle
// is taken).

export const DEG = 180 / Math.PI;

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const len = (a) => Math.hypot(a.x, a.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const neg = (a) => ({ x: -a.x, y: -a.y });
export const ccw = (a) => ({ x: -a.y, y: a.x });
export function norm(a) {
  const l = len(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function toWorld(lm, aspect) {
  return { x: lm.x * aspect, y: -lm.y };
}

export function fromWorld(p, aspect) {
  return { x: p.x / aspect, y: -p.y };
}

// Angle of vec (deg) in the basis (xAxis, yAxis), counter-clockwise positive.
export function signedAngle(vec, xAxis, yAxis) {
  return Math.atan2(dot(vec, yAxis), dot(vec, xAxis)) * DEG;
}

export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const rotate = (a, rad) => {
  const c = Math.cos(rad), s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

// Where the frame is anchored: the top of the manubrium (the jugular notch), given
// as its distance below the shoulder midpoint in shoulder widths. In a good Standard
// hold the upper arms are raised 90 degrees from the side (Neil, 2026-10-23), so the
// elbows sit level with the shoulder joints and the line between them crosses the
// midline at the shoulder midpoint, the level of the jugular notch. A perfect frame
// reads 0 there. Kept as a setting of the model in case the hold is ever taken lower.
export const MANUBRIUM_DROP = 0;

// The spine as one smooth curve: a circular arc from the hip midpoint H to the
// shoulder midpoint S that leaves the pelvis along t0 (unit, up the body). For such
// an arc the chord sits halfway between the two end directions, so the total turn
// is twice the angle from t0 to the chord. at(s) and tangent(s) take s = 0 at the
// hips to 1 at the shoulders (fraction of the chord).
export function spineArc(H, S, t0) {
  const c = sub(S, H);
  const L = len(c);
  const theta = 2 * Math.atan2(cross(t0, c), dot(t0, c));
  const n = ccw(t0);
  const at = (s) => {
    const a = theta * s;
    if (Math.abs(theta) < 1e-9) return add(H, scale(c, s));
    const R = L / (2 * Math.sin(theta / 2));
    return add(H, add(scale(t0, R * Math.sin(a)), scale(n, R * (1 - Math.cos(a)))));
  };
  return { H, S, t0, L, theta, at, tangent: (s) => rotate(t0, theta * s) };
}

// The body's reference frame, taken at the manubrium.
//   S  shoulder midpoint;  V  the manubrium, where the frame is measured from
//   u  "up the body" at V;  hL "body-horizontal" at V, toward the dancer's left
//   chordU  straight hips-to-shoulders direction (full mode)
// full:  the spine curve from the hips to S. The pelvis direction t0 is square to the
//        hip line when standing; when sitting the chair holds the pelvis upright, so
//        t0 is the image vertical (camera assumed level).
// torso: hL is the shoulder line itself; u is perpendicular, on the head's side.
export function bodyFrame(w, mode, { posture = 'standing' } = {}) {
  const S = mid(w.LS, w.RS);
  const across = sub(w.LS, w.RS);
  const drop = MANUBRIUM_DROP * len(across);
  const leftSide = (p) => (dot(p, across) >= 0 ? p : neg(p));
  if (mode === 'full') {
    const H = mid(w.LH, w.RH);
    let t0 = { x: 0, y: 1 };
    if (posture !== 'sitting') {
      t0 = ccw(norm(sub(w.LH, w.RH)));
      if (dot(t0, sub(S, H)) < 0) t0 = neg(t0);
    }
    const arc = spineArc(H, S, t0);
    const sM = Math.min(1, Math.max(0, 1 - drop / arc.L));
    const u = arc.tangent(sM);
    return { mode, posture, S, H, V: arc.at(sM), u, hL: leftSide(ccw(u)), chordU: norm(sub(S, H)), arc, sM };
  }
  const hL = norm(across);
  let u = ccw(hL);
  const up = w.C ? sub(w.C, S) : { x: 0, y: 1 };
  if (dot(u, up) < 0) u = neg(u);
  return { mode, posture: null, S, V: sub(S, scale(u, drop)), u, hL };
}

// Elevation (deg) of elbow E above body-horizontal, seen from the frame vertex V,
// on the side whose outward direction is sideDir.
export function sideElevation(E, V, u, sideDir) {
  return signedAngle(sub(E, V), sideDir, u);
}

// Face left-right axis from [left, right] point pairs (world coords).
export function faceAxis(pairs) {
  let sum = { x: 0, y: 0 };
  for (const [l, r] of pairs) sum = add(sum, norm(sub(l, r)));
  return len(sum) > 0 ? norm(sum) : null;
}

// Lean of an up-the-body direction from the image vertical (deg), + toward the
// dancer's right. Defaults to the frame's u (the top of the body, at the manubrium).
export function leanFromVertical(frame, dir = frame.u) {
  const rightIsImageLeft = frame.hL.x >= 0;
  return Math.atan2(rightIsImageLeft ? -dir.x : dir.x, dir.y) * DEG;
}
