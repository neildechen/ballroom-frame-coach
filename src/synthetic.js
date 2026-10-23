// Synthetic dancers, used by the test suite and the in-app demo. A skeleton is built in "body coordinates"
// (origin at the shoulder midpoint, +x toward the dancer's left, +y up the
// body): the pelvis, a spine curved by `bend` (the same circular-arc model the
// analysis uses), and the shoulders, arms and head set on the top of that curve.
// It is then swayed as a whole, rolled by the camera, optionally mirrored, and
// written out as MediaPipe-style normalized landmarks (x right, y down, both
// 0..1 of the image width/height).

import { POSE, POSE_COUNT, FACE_PAIRS, FACE_COUNT } from './landmarks.js';
import { spineArc, MANUBRIUM_DROP } from './geometry.js';

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
  sway: 0, // deg; whole-body lean, pelvis included; + = toward the dancer's right
  bend: 0, // deg; total turn of the spine curve from pelvis to shoulders; + = top toward the dancer's right
  bendAt: null, // null = bend spread as the model's even arc; a number = all of it at one hinge, as a share of the torso up from the hips
  sitting: false, // knees forward, thighs pointing at the camera
  hipLineTilt: 0, // deg; rotates only the two hip points (tracking error on the hip line)
  kneesVisible: true,
  elevL: 0, // deg above body-horizontal, shoulder midpoint -> left elbow
  elevR: 0,
  shoulderTilt: 0, // deg; + = left shoulder higher than body-horizontal
  headRoll: 0, // deg relative to the body; + = head tilted to the dancer's right
  headYaw: 0, // deg; + = face turned toward the dancer's left
  headPitch: 0,
  gazeX: 0, // pupils' shift in the eye, head-local units; + = looking to the dancer's left
  gazeY: 0,
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

  // Spine: pelvis upright in body coordinates, chord length = torso, total turn = bend.
  const b = rad(p.bend);
  const drop = MANUBRIUM_DROP * 2 * p.shoulderHalf;
  let Sb, V, u, topDeg;
  if (p.bendAt == null) {
    Sb = { x: -p.torso * Math.sin(b / 2), y: p.torso * Math.cos(b / 2) };
    const arc = spineArc({ x: 0, y: 0 }, Sb, { x: 0, y: 1 });
    const sM = 1 - drop / p.torso;
    const Vw = arc.at(sM), uw = arc.tangent(sM);
    // Shift so the shoulder midpoint is the origin.
    V = [Vw.x - Sb.x, Vw.y - Sb.y];
    u = [uw.x, uw.y];
    topDeg = (b * sM * 180) / Math.PI;
  } else {
    // Two straight pieces: pelvis-upright below the hinge, turned by the whole bend above it.
    u = [-Math.sin(b), Math.cos(b)];
    Sb = { x: p.torso * (1 - p.bendAt) * u[0], y: p.torso * p.bendAt + p.torso * (1 - p.bendAt) * u[1] };
    V = [-drop * u[0], -drop * u[1]];
    topDeg = p.bend;
  }
  const hL = [u[1], -u[0]]; // square to u, toward the dancer's left
  const along = (o, k1, d1, k2, d2) => [o[0] + d1[0] * k1 + d2[0] * k2, o[1] + d1[1] * k1 + d2[1] * k2];

  const sh = [hL[0] * Math.cos(rad(p.shoulderTilt)) + u[0] * Math.sin(rad(p.shoulderTilt)), hL[1] * Math.cos(rad(p.shoulderTilt)) + u[1] * Math.sin(rad(p.shoulderTilt))];
  const LS = [sh[0] * p.shoulderHalf, sh[1] * p.shoulderHalf];
  const RS = [-LS[0], -LS[1]];
  const LE = along(V, p.armReach * Math.cos(rad(p.elevL)), hL, p.armReach * Math.sin(rad(p.elevL)), u);
  const RE = along(V, -p.armReach * Math.cos(rad(p.elevR)), hL, p.armReach * Math.sin(rad(p.elevR)), u);
  const H = [-Sb.x, -Sb.y];
  const hip = rot([p.hipHalf, 0], p.hipLineTilt);
  const LH = [H[0] + hip[0], H[1] + hip[1]];
  const RH = [H[0] - hip[0], H[1] - hip[1]];
  const kneeDrop = p.sitting ? 0.25 : 0.9; // share of the torso length, see analyze.js POSTURE
  const LK = [LH[0] + 0.01, LH[1] - kneeDrop * p.torso];
  const RK = [RH[0] - 0.01, RH[1] - kneeDrop * p.torso];
  // Head centre on the axis carried up from the manubrium; headOffset along hL.
  const halfShoulders = p.shoulderHalf * Math.cos(rad(p.shoulderTilt));
  const C = along(V, p.headOffset * halfShoulders, hL, p.headHeight + MANUBRIUM_DROP * 2 * p.shoulderHalf, u);

  const head = (local) => {
    let q = rotX(local.map((c) => c * p.size), -p.headPitch);
    q = rotY(q, p.headYaw);
    q = rotZ(q, p.headRoll + topDeg);
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
  set(POSE.LEFT_KNEE, LK, p.hipsVisible && p.kneesVisible ? p.visibility : 0.05);
  set(POSE.RIGHT_KNEE, RK, p.hipsVisible && p.kneesVisible ? p.visibility : 0.05);
  set(POSE.LEFT_EAR, head(EARS_LOCAL[0]));
  set(POSE.RIGHT_EAR, head(EARS_LOCAL[1]));
  set(POSE.LEFT_EYE, head(EYES_LOCAL[0]));
  set(POSE.RIGHT_EYE, head(EYES_LOCAL[1]));
  set(POSE.NOSE, head(NOSE_LOCAL));

  let face = null;
  if (p.faceVisible) {
    const c = place(C);
    face = Array.from({ length: FACE_COUNT }, () => ({ x: c.x, y: c.y, z: 0 }));
    const pupils = [[0.03 + p.gazeX, 0.02 + p.gazeY, 0.078], [-0.03 + p.gazeX, 0.02 + p.gazeY, 0.078]];
    const local = [...FACE_LOCAL, pupils];
    FACE_PAIRS.forEach(([li, ri], k) => {
      face[li] = { ...place(head(local[k][0])), z: 0 };
      face[ri] = { ...place(head(local[k][1])), z: 0 };
    });
  }

  return { pose, face, aspect: p.aspect, params: p };
}
