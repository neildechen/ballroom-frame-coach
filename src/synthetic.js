// Synthetic dancers, used by the test suite and the in-app demo. A skeleton is built in "body coordinates"
// (origin at the shoulder midpoint, +x toward the dancer's left, +y up the
// body), then swayed, rolled by the camera, optionally mirrored, and finally
// written out as MediaPipe-style normalized landmarks (x right, y down, both
// 0..1 of the image width/height).

import { POSE, POSE_COUNT, FACE_PAIRS, FACE_COUNT } from './landmarks.js';

const rad = (d) => (d * Math.PI) / 180;
const rot = ([x, y], deg) => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

// 3D rotations for the head (x toward the dancer's left, y up, z toward camera).
const rotX = ([x, y, z], deg) => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
};
const rotY = ([x, y, z], deg) => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
};
const rotZ = ([x, y, z], deg) => {
  const [a, b] = rot([x, y], deg);
  return [a, b, z];
};

// Head-local face points [left, right] for each FACE_PAIRS entry.
const FACE_LOCAL = [
  [[0.045, 0.02, 0.07], [-0.045, 0.02, 0.07]], // outer eye corners
  [[0.015, 0.02, 0.075], [-0.015, 0.02, 0.075]], // inner eye corners
  [[0.025, -0.04, 0.07], [-0.025, -0.04, 0.07]], // mouth corners
  [[0.07, -0.01, 0.03], [-0.07, -0.01, 0.03]], // cheeks
];
const EARS_LOCAL = [[0.075, 0, 0], [-0.075, 0, 0]];
const EYES_LOCAL = FACE_LOCAL[0];
const NOSE_LOCAL = [0, -0.005, 0.1];

export const DEFAULT_DANCER = {
  sway: 0, // deg; + = top of the body toward the dancer's right
  elevL: 0, // deg above body-horizontal, shoulder midpoint -> left elbow
  elevR: 0,
  shoulderTilt: 0, // deg; + = left shoulder higher than body-horizontal
  headRoll: 0, // deg relative to the body; + = head tilted to the dancer's right
  headYaw: 0, // deg; + = face turned toward the dancer's left
  headPitch: 0,
  headOffset: 0, // fraction of half the shoulder width; + = toward the dancer's left
  size: 1, // multiplies every body length below
  armReach: 0.3, // shoulder midpoint to elbow, in image heights
  shoulderHalf: 0.1,
  hipHalf: 0.08,
  torso: 0.3,
  headHeight: 0.22, // head centre above the shoulder midpoint
  cameraRoll: 0, // deg; rotates the whole image
  mirror: false,
  aspect: 16 / 9, // image width / height
  cx: 0.5, // normalized position of the shoulder midpoint
  cy: 0.35,
  hipsVisible: true,
  faceVisible: true,
  visibility: 0.99,
  leftElbowVisibility: null,
  rightElbowVisibility: null,
};

export function makeDancer(overrides = {}) {
  const p = { ...DEFAULT_DANCER, ...overrides };
  for (const k of ['armReach', 'shoulderHalf', 'hipHalf', 'torso', 'headHeight']) p[k] *= p.size;

  const LS = rot([p.shoulderHalf, 0], p.shoulderTilt);
  const RS = [-LS[0], -LS[1]];
  const LE = [p.armReach * Math.cos(rad(p.elevL)), p.armReach * Math.sin(rad(p.elevL))];
  const RE = [-p.armReach * Math.cos(rad(p.elevR)), p.armReach * Math.sin(rad(p.elevR))];
  const LH = [p.hipHalf, -p.torso];
  const RH = [-p.hipHalf, -p.torso];
  const C = [p.headOffset * LS[0], p.headHeight]; // LS[0] = half the shoulder width along body-horizontal

  const head = (local) => {
    let q = rotX(local.map((c) => c * p.size), -p.headPitch);
    q = rotY(q, p.headYaw);
    q = rotZ(q, p.headRoll);
    return [C[0] + q[0], C[1] + q[1]];
  };

  // body frame -> image world (x right, y up, units of image height)
  const place = ([x, y]) => {
    let q = rot([x, y], p.sway);
    q = rot(q, p.cameraRoll);
    if (p.mirror) q = [-q[0], q[1]];
    return { x: (p.cx * p.aspect + q[0]) / p.aspect, y: p.cy - q[1] };
  };

  const pose = Array.from({ length: POSE_COUNT }, () => ({ x: p.cx, y: p.cy, z: 0, visibility: 0.2 }));
  const set = (i, pt, vis = p.visibility) => {
    pose[i] = { ...place(pt), z: 0, visibility: vis };
  };
  set(POSE.LEFT_SHOULDER, LS);
  set(POSE.RIGHT_SHOULDER, RS);
  set(POSE.LEFT_ELBOW, LE, p.leftElbowVisibility ?? p.visibility);
  set(POSE.RIGHT_ELBOW, RE, p.rightElbowVisibility ?? p.visibility);
  set(POSE.LEFT_HIP, LH, p.hipsVisible ? p.visibility : 0.05);
  set(POSE.RIGHT_HIP, RH, p.hipsVisible ? p.visibility : 0.05);
  set(POSE.LEFT_EAR, head(EARS_LOCAL[0]));
  set(POSE.RIGHT_EAR, head(EARS_LOCAL[1]));
  set(POSE.LEFT_EYE, head(EYES_LOCAL[0]));
  set(POSE.RIGHT_EYE, head(EYES_LOCAL[1]));
  set(POSE.NOSE, head(NOSE_LOCAL));

  let face = null;
  if (p.faceVisible) {
    const c = place(C);
    face = Array.from({ length: FACE_COUNT }, () => ({ x: c.x, y: c.y, z: 0 }));
    FACE_PAIRS.forEach(([li, ri], k) => {
      face[li] = { ...place(head(FACE_LOCAL[k][0])), z: 0 };
      face[ri] = { ...place(head(FACE_LOCAL[k][1])), z: 0 };
    });
  }

  return { pose, face, aspect: p.aspect, params: p };
}
