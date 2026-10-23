// One frame of landmarks -> raw measurements. No time, no smoothing, no verdicts.

import { POSE, FACE_PAIRS, FACE_CHEEKS } from './landmarks.js';
import { toWorld, mid, sub, dot, len, neg, ccw, bodyFrame, sideElevation, faceAxis, signedAngle, leanFromVertical, DEG } from './geometry.js';

export const DEFAULT_TRACKING = {
  mode: 'auto', // 'auto' | 'full' | 'torso'
  posture: 'auto', // 'auto' | 'standing' | 'sitting' (full mode only)
  minVisibility: 0.5,
  hipEnter: 0.7, // hip confidence needed to switch into full view...
  hipExit: 0.5, // ...and the lower bar for staying in it, so the view does not flicker
};

// Knee drop below the hips, as a share of the hips-to-shoulders length. Standing,
// the thighs hang straight down (about 0.9); sitting facing the camera they point
// at it and look short (about 0.2 to 0.4). Session.js latches between these with a
// gap; a single measure() call splits at the middle.
export const POSTURE = { sitBelow: 0.5, standAbove: 0.65 };

const seen = (lm, min) => lm && (lm.visibility ?? 1) >= min;
const inImage = (lm, maxY) => lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= maxY;

// `current` is the view in use, if any: entering full view needs clearly visible
// hips away from the bottom edge, staying in it only needs usable ones.
export function chooseMode(pose, opts = {}, current = null) {
  const o = { ...DEFAULT_TRACKING, ...opts };
  if (o.mode === 'full' || o.mode === 'torso') return o.mode;
  const staying = current === 'full';
  const vis = staying ? o.hipExit : o.hipEnter;
  const maxY = staying ? 1 : 0.97;
  const hips = [pose[POSE.LEFT_HIP], pose[POSE.RIGHT_HIP]];
  return hips.every((h) => seen(h, vis) && inImage(h, maxY)) ? 'full' : 'torso';
}

const EMPTY = Object.freeze({
  tracked: false, mode: null, posture: null, kneeDrop: null, sway: null, top: null, bend: null, elevL: null, elevR: null, shoulderTilt: null,
  headRoll: null, headOffset: null, headSource: null, frame: null, points: null,
});

export function measure({ pose, face, aspect }, opts = {}) {
  const o = { ...DEFAULT_TRACKING, ...opts };
  if (!pose) return EMPTY;
  const P = (i) => pose[i];
  const W = (lm) => toWorld(lm, aspect);
  if (!seen(P(POSE.LEFT_SHOULDER), o.minVisibility) || !seen(P(POSE.RIGHT_SHOULDER), o.minVisibility)) return EMPTY;

  const mode = chooseMode(pose, o);
  const w = { LS: W(P(POSE.LEFT_SHOULDER)), RS: W(P(POSE.RIGHT_SHOULDER)) };
  if (mode === 'full') {
    w.LH = W(P(POSE.LEFT_HIP));
    w.RH = W(P(POSE.RIGHT_HIP));
  }
  const leftEar = P(POSE.LEFT_EAR), rightEar = P(POSE.RIGHT_EAR);
  if (seen(leftEar, o.minVisibility) && seen(rightEar, o.minVisibility)) {
    w.C = mid(W(leftEar), W(rightEar));
  } else if (face) {
    w.C = mid(W(face[FACE_CHEEKS[0]]), W(face[FACE_CHEEKS[1]]));
  }
  const LE = seen(P(POSE.LEFT_ELBOW), o.minVisibility) ? W(P(POSE.LEFT_ELBOW)) : null;
  const RE = seen(P(POSE.RIGHT_ELBOW), o.minVisibility) ? W(P(POSE.RIGHT_ELBOW)) : null;
  w.LE = LE; w.RE = RE;

  let kneeDrop = null;
  if (mode === 'full' && seen(P(POSE.LEFT_KNEE), o.minVisibility) && seen(P(POSE.RIGHT_KNEE), o.minVisibility)) {
    const H = mid(w.LH, w.RH);
    kneeDrop = (H.y - mid(W(P(POSE.LEFT_KNEE)), W(P(POSE.RIGHT_KNEE))).y) / len(sub(mid(w.LS, w.RS), H));
  }
  let posture = null;
  if (mode === 'full') {
    posture = o.posture === 'standing' || o.posture === 'sitting' ? o.posture
      : kneeDrop != null && kneeDrop < (POSTURE.sitBelow + POSTURE.standAbove) / 2 ? 'sitting' : 'standing';
  }

  const frame = bodyFrame(w, mode, { posture });
  const { S, V, u, hL } = frame;
  const elevL = LE ? sideElevation(LE, V, u, hL) : null;
  const elevR = RE ? sideElevation(RE, V, u, neg(hL)) : null;
  const shoulderTilt = mode === 'full' ? signedAngle(sub(w.LS, w.RS), hL, u) : null;

  let axis = null, headSource = null;
  if (face) {
    axis = faceAxis(FACE_PAIRS.filter(([l, r]) => face[l] && face[r]).map(([l, r]) => [W(face[l]), W(face[r])]));
    headSource = 'face';
  }
  if (!axis) {
    const pairs = [[POSE.LEFT_EYE, POSE.RIGHT_EYE], [POSE.LEFT_EAR, POSE.RIGHT_EAR]]
      .filter(([l, r]) => seen(P(l), o.minVisibility) && seen(P(r), o.minVisibility))
      .map(([l, r]) => [W(P(l)), W(P(r))]);
    axis = faceAxis(pairs);
    headSource = axis ? 'pose' : null;
  }
  const headRoll = axis ? signedAngle(axis, hL, u) : null;

  // Head position: sideways distance of the head centre from the body axis carried
  // up from the manubrium, as a fraction of half the shoulder width.
  let headOffset = null;
  const halfShoulders = dot(sub(w.LS, w.RS), hL) / 2;
  if (w.C && halfShoulders > 0) headOffset = dot(sub(w.C, V), hL) / halfShoulders;

  return {
    tracked: true,
    mode,
    posture,
    kneeDrop,
    // sway: the straight hips-to-shoulders line's lean; top: the lean at the
    // manubrium, which the frame is judged against; bend: the spine curve's total turn.
    sway: leanFromVertical(frame, frame.chordU ?? frame.u),
    top: leanFromVertical(frame),
    // + = curving toward the dancer's right, whichever way the image is mirrored
    bend: frame.arc ? frame.arc.theta * DEG * (dot(ccw(frame.u), frame.hL) < 0 ? 1 : -1) : null,
    elevL, elevR, shoulderTilt,
    headRoll, headOffset, headSource,
    frame,
    points: { ...w, V, faceAxis: axis },
  };
}
