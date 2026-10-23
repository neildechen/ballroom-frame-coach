import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, chooseMode } from '../src/analyze.js';
import { POSE, FACE_PAIRS } from '../src/landmarks.js';
import { makeDancer, imageAngle } from './fixtures.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);
const run = (d, opts) => measure(makeDancer(d), opts);

test('neutral dancer measures zero everywhere', () => {
  const m = run({});
  assert.equal(m.tracked, true);
  assert.equal(m.mode, 'full');
  close(m.elevL, 0, 1e-6); close(m.elevR, 0, 1e-6);
  close(m.shoulderTilt, 0, 1e-6);
  close(m.headRoll, 0, 1e-6); close(m.headOffset, 0, 1e-6);
  close(m.sway, 0, 1e-6);
  assert.equal(m.headSource, 'face');
});

test("Neil's example: 30 deg sway right with a level frame reads as level", () => {
  const d = makeDancer({ sway: 30 });
  const P = d.pose;
  const S = { x: (P[POSE.LEFT_SHOULDER].x + P[POSE.RIGHT_SHOULDER].x) / 2, y: (P[POSE.LEFT_SHOULDER].y + P[POSE.RIGHT_SHOULDER].y) / 2 };
  // In the raw image the dancer faces the camera, so their right elbow is on image-left.
  // Right elbow-to-centre line sits 30 deg below horizontal, left elbow 30 deg above.
  // centre -> right elbow points to image-left and 30 deg down: -150 deg from image +x.
  close(imageAngle(S, P[POSE.RIGHT_ELBOW], d.aspect), -150, 1e-6, 'centre -> right elbow');
  close(imageAngle(S, P[POSE.LEFT_ELBOW], d.aspect), 30, 1e-6, 'centre -> left elbow');
  // Head is tilted 30 deg in the image: the left eye sits higher than the right.
  close(imageAngle(P[POSE.RIGHT_EYE], P[POSE.LEFT_EYE], d.aspect), 30, 1e-6, 'eye line');

  const m = measure(d);
  close(m.sway, 30, 1e-6, 'sway');
  close(m.elevL, 0, 1e-6); close(m.elevR, 0, 1e-6);
  close(m.headRoll, 0, 1e-6); close(m.headOffset, 0, 1e-6);
});

test('per-side elevation is recovered under sway', () => {
  const m = run({ sway: -20, elevL: 8, elevR: -6 });
  close(m.elevL, 8, 1e-6); close(m.elevR, -6, 1e-6);
});

test('a frame tilted against the body is detected even though the included angle is 180', () => {
  // Rigid frame rotation: left up 12, right down 12 -> straight line, but not level with the body.
  const m = run({ sway: 15, elevL: 12, elevR: -12 });
  close(m.elevL, 12, 1e-6); close(m.elevR, -12, 1e-6);
});

test('shoulder tilt relative to the body axis', () => {
  const m = run({ sway: 10, shoulderTilt: -7 });
  close(m.shoulderTilt, -7, 1e-6);
});

test('head roll is measured relative to the body and ignores head turn and nod', () => {
  for (const [yaw, pitch] of [[0, 0], [40, 0], [-35, 0], [30, 15], [-20, -10]]) {
    const m = run({ sway: 12, headRoll: 6, headYaw: yaw, headPitch: pitch });
    close(m.headRoll, 6, 1e-6, `yaw ${yaw} pitch ${pitch}`);
  }
});

test('the pupil line counts toward head tilt, and gaze does not move it', () => {
  for (const [gx, gy] of [[0, 0], [0.012, 0], [-0.012, 0.006]]) {
    const m = run({ sway: -14, headRoll: 7, headYaw: 20, gazeX: gx, gazeY: gy });
    close(m.headRoll, 7, 1e-6, `gaze ${gx},${gy}`);
  }
  // Pupils alone (every other face pair missing) still give the axis.
  const d = makeDancer({ sway: 9, headRoll: -6 });
  for (const [l, r] of FACE_PAIRS.slice(0, -1)) { d.face[l] = undefined; d.face[r] = undefined; }
  close(measure(d).headRoll, -6, 1e-6, 'pupils only');
});

test('head offset is a fraction of half the shoulder width, measured from the body axis along body-horizontal', () => {
  const m = run({ sway: -18, headOffset: 0.25, elevL: 5, elevR: 9 });
  close(m.headOffset, 0.25, 1e-6);
  const n = run({ headOffset: -0.4, headYaw: 40 });
  close(n.headOffset, -0.4, 1e-6);
});

test('head falls back to pose eyes when no face mesh is available', () => {
  const m = run({ sway: 10, headRoll: -8, faceVisible: false });
  assert.equal(m.headSource, 'pose');
  close(m.headRoll, -8, 1e-6);
});

test('mode: auto uses hips when visible, else the shoulder line', () => {
  assert.equal(chooseMode(makeDancer({}).pose, {}), 'full');
  assert.equal(chooseMode(makeDancer({ hipsVisible: false }).pose, {}), 'torso');
  assert.equal(chooseMode(makeDancer({ cy: 0.85 }).pose, {}), 'torso', 'hips below the image edge');
  assert.equal(chooseMode(makeDancer({ hipsVisible: false }).pose, { mode: 'full' }), 'full');
  assert.equal(chooseMode(makeDancer({}).pose, { mode: 'torso' }), 'torso');
});

test('torso mode measures elbows against the shoulder line', () => {
  const m = run({ hipsVisible: false, shoulderTilt: 10, elevL: 0, elevR: 0, sway: 20 });
  assert.equal(m.mode, 'torso');
  close(m.elevL, -10, 1e-6); close(m.elevR, 10, 1e-6);
  assert.equal(m.shoulderTilt, null);
});

test('untracked: missing shoulders means nothing is measured', () => {
  const d = makeDancer({});
  d.pose[POSE.LEFT_SHOULDER].visibility = 0.1;
  const m = measure(d);
  assert.equal(m.tracked, false);
});

test('untracked: a low-confidence elbow yields null for that side only', () => {
  const m = run({ leftElbowVisibility: 0.2, elevR: -9 });
  assert.equal(m.tracked, true);
  assert.equal(m.elevL, null);
  close(m.elevR, -9, 1e-6);
  close(m.headOffset, 0, 1e-6, 'offset does not need the elbows');
});
