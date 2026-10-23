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

// The body's reference frame.
//   S  shoulder midpoint (frame vertex)
//   u  "up the body" unit vector
//   hL "body-horizontal" unit vector pointing toward the dancer's left
// full:  u runs from the hip midpoint to S; hL is perpendicular, on the left shoulder's side.
// torso: hL is the shoulder line itself; u is perpendicular, on the head's side.
export function bodyFrame(w, mode) {
  const S = mid(w.LS, w.RS);
  const across = sub(w.LS, w.RS);
  if (mode === 'full') {
    const u = norm(sub(S, mid(w.LH, w.RH)));
    const p = ccw(u);
    const hL = dot(p, across) >= 0 ? p : neg(p);
    return { mode, S, u, hL };
  }
  const hL = norm(across);
  let u = ccw(hL);
  const up = w.C ? sub(w.C, S) : { x: 0, y: 1 };
  if (dot(u, up) < 0) u = neg(u);
  return { mode, S, u, hL };
}

// Elevation (deg) of elbow E above body-horizontal, seen from S, on the side
// whose outward direction is sideDir.
export function sideElevation(E, S, u, sideDir) {
  return signedAngle(sub(E, S), sideDir, u);
}

// Face left-right axis from [left, right] point pairs (world coords).
export function faceAxis(pairs) {
  let sum = { x: 0, y: 0 };
  for (const [l, r] of pairs) sum = add(sum, norm(sub(l, r)));
  return len(sum) > 0 ? norm(sum) : null;
}

// Lean of the body axis from the image vertical (deg), + toward the dancer's right.
export function leanFromVertical(frame) {
  const rightIsImageLeft = frame.hL.x >= 0;
  return Math.atan2(rightIsImageLeft ? -frame.u.x : frame.u.x, frame.u.y) * DEG;
}
