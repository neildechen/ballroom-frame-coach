// One frame of landmarks -> raw measurements. No time, no smoothing, no verdicts.

import { POSE, FACE_PAIRS, FACE_CHEEKS } from './landmarks.js';
import { toWorld, mid, sub, dot, neg, bodyFrame, sideElevation, faceAxis, signedAngle, leanFromVertical } from './geometry.js';

export const DEFAULT_TRACKING = {
  mode: 'auto', // 'auto' | 'full' | 'torso'
  minVisibility: 0.5,
  hipVisibility: 0.6,
};

const seen = (lm, min) => lm && (lm.visibility ?? 1) >= min;
const inImage = (lm) => lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1;

export function chooseMode(pose, opts = {}) {
  const o = { ...DEFAULT_TRACKING, ...opts };
  if (o.mode === 'full' || o.mode === 'torso') return o.mode;
  const hips = [pose[POSE.LEFT_HIP], pose[POSE.RIGHT_HIP]];
  return hips.every((h) => seen(h, o.hipVisibility) && inImage(h)) ? 'full' : 'torso';
}

const EMPTY = Object.freeze({
  tracked: false, mode: null, sway: null, elevL: null, elevR: null, shoulderTilt: null,
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

  const frame = bodyFrame(w, mode);
  const { S, u, hL } = frame;
  const elevL = LE ? sideElevation(LE, S, u, hL) : null;
  const elevR = RE ? sideElevation(RE, S, u, neg(hL)) : null;
  const shoulderTilt = mode === 'full' ? signedAngle(sub(w.LS, w.RS), hL, u) : null;

  let axis = null, headSource = null;
  if (face) {
    axis = faceAxis(FACE_PAIRS.map(([l, r]) => [W(face[l]), W(face[r])]));
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

  // Head position: sideways distance of the head centre from the body axis
  // through S, as a fraction of half the shoulder width.
  let headOffset = null;
  const halfShoulders = dot(sub(w.LS, w.RS), hL) / 2;
  if (w.C && halfShoulders > 0) headOffset = dot(sub(w.C, S), hL) / halfShoulders;

  return {
    tracked: true,
    mode,
    sway: leanFromVertical(frame),
    elevL, elevR, shoulderTilt,
    headRoll, headOffset, headSource,
    frame,
    points: { ...w, faceAxis: axis },
  };
}
