// The curved-spine model: the frame is judged square to the spine at the top of
// the manubrium, not to the straight hips-to-shoulders line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spineArc, rotate, len, sub, signedAngle, neg, ccw, DEG } from '../src/geometry.js';
import { measure } from '../src/analyze.js';
import { Session } from '../src/session.js';
import { POSE } from '../src/landmarks.js';
import { makeDancer } from './fixtures.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);
const W = (lm, aspect) => ({ x: lm.x * aspect, y: -lm.y });

test('spine arc: leaves the pelvis along t0, ends at the shoulders, one constant curvature', () => {
  const H = { x: 0.2, y: -0.9 }, t0 = rotate({ x: 0, y: 1 }, 0.1), S = { x: 0.05, y: -0.55 };
  const a = spineArc(H, S, t0);
  close(len(sub(a.at(0), H)), 0, 1e-12, 'start');
  close(len(sub(a.at(1), S)), 0, 1e-12, 'end');
  close(signedAngle(a.tangent(0), t0, ccw(t0)), 0, 1e-12, 'leaves along t0');
  // The chord sits halfway between the end directions.
  close(signedAngle(sub(S, H), t0, ccw(t0)) * 2, a.theta * DEG, 1e-9, 'total turn = 2 x chord angle');
  // Every point is the same distance from one centre.
  const R = len(sub(S, H)) / (2 * Math.sin(a.theta / 2));
  const centre = { x: H.x + ccw(t0).x * R, y: H.y + ccw(t0).y * R };
  for (const s of [0, 0.25, 0.5, 0.9, 1]) close(len(sub(a.at(s), centre)), Math.abs(R), 1e-9, `radius at ${s}`);
});

test('pelvis level, spine bent: the level line at the top tilts twice as far as the straight line', () => {
  const m = measure(makeDancer({ bend: 30 }));
  close(m.sway, 15, 1e-6, 'straight hips-to-shoulders line');
  close(m.top, 30, 1e-6, 'top of the manubrium');
  close(m.bend, 30, 1e-6, 'bend');
});

test('whole body tilted with the pelvis: no curve, the top matches the straight line', () => {
  const m = measure(makeDancer({ sway: 15 }));
  close(m.sway, 15, 1e-6); close(m.top, 15, 1e-6); close(m.bend, 0, 1e-6);
});

test('a frame square to the curved spine reads level; the straight-line model would call it tilted', () => {
  const d = makeDancer({ bend: 30 });
  const m = measure(d);
  close(m.elevL, 0, 1e-6); close(m.elevR, 0, 1e-6);
  // Against the straight line (15 deg), the same elbows sit 15 deg off on each side.
  const a = d.aspect, P = d.pose;
  const H = { x: (W(P[POSE.LEFT_HIP], a).x + W(P[POSE.RIGHT_HIP], a).x) / 2, y: (W(P[POSE.LEFT_HIP], a).y + W(P[POSE.RIGHT_HIP], a).y) / 2 };
  const S = m.frame.S;
  const chord = sub(S, H), cu = { x: chord.x / len(chord), y: chord.y / len(chord) };
  const hLc = ccw(cu).x * m.frame.hL.x + ccw(cu).y * m.frame.hL.y > 0 ? ccw(cu) : neg(ccw(cu));
  const straightL = signedAngle(sub(W(P[POSE.LEFT_ELBOW], a), S), hLc, cu);
  const straightR = signedAngle(sub(W(P[POSE.RIGHT_ELBOW], a), S), neg(hLc), cu);
  close(straightL, 15, 1e-6, 'left reads 15 up against the straight line');
  close(straightR, -15, 1e-6, 'right reads 15 down against the straight line');
});

test('standing: the pelvis comes from the hip line, so a tilted pelvis with a bent spine is measured', () => {
  for (const [sway, bend] of [[8, 20], [-12, -25], [5, -10]]) {
    const m = measure(makeDancer({ sway, bend, elevL: 4, elevR: -6, cameraRoll: 7, mirror: true }));
    assert.equal(m.posture, 'standing');
    close(m.top, sway + bend + 7, 1e-6, `top ${sway}/${bend} (camera roll counts, as in sway)`);
    close(m.elevL, 4, 1e-6); close(m.elevR, -6, 1e-6);
  }
});

test('sitting: the pelvis is taken as upright (camera level), so a wrong hip line does not matter', () => {
  for (const hipLineTilt of [0, 9, -12]) {
    const m = measure(makeDancer({ sitting: true, bend: 24, hipLineTilt, elevL: -5, elevR: 3, mirror: true }));
    assert.equal(m.posture, 'sitting', `posture with hip line ${hipLineTilt}`);
    close(m.top, 24, 1e-6, `top with hip line ${hipLineTilt}`);
    close(m.elevL, -5, 1e-6); close(m.elevR, 3, 1e-6);
  }
});

test('posture switches only after the knees stay put for 0.7 s, and holds when the knees are hidden', () => {
  const s = new Session();
  const run = (d, t0, t1) => { let v; for (let t = t0; t <= t1; t += 33) v = s.update({ ...makeDancer(d), t }); return v; };
  assert.equal(run({}, 0, 500).posture, 'standing');
  assert.equal(run({ sitting: true }, 533, 1000).posture, 'standing', 'not yet');
  assert.equal(run({ sitting: true }, 1033, 1500).posture, 'sitting');
  assert.equal(run({ sitting: true, kneesVisible: false }, 1533, 3000).posture, 'sitting', 'knees hidden: keep');
  assert.equal(run({}, 3033, 3200).posture, 'sitting', 'a brief stand does not flip it');
  assert.equal(run({}, 3233, 4200).posture, 'standing');
});

test('torso view keeps the shoulder line as level and reports no bend', () => {
  const m = measure(makeDancer({ hipsVisible: false, sway: 14 }));
  assert.equal(m.mode, 'torso'); assert.equal(m.posture, null); assert.equal(m.bend, null);
  close(m.top, 14, 1e-6); close(m.sway, 14, 1e-6);
});

// Known limit of the even-arc model (Neil 2026-10-23: shoulders flagged on the sway
// side during correct sways). The model is exact when the bend is spread evenly or
// centred at mid-torso. A bend concentrated higher (releasing sway at the diaphragm,
// upper thoracic) turns the top further than the model predicts, so the sway side
// reads low; a bend low in the lumbar spine over a level pelvis does the opposite.
// The shoulders, the elbows and the head all carry the same error.
test('known limit: where the spine bends decides the error, and every check shares it', () => {
  const cases = [
    // bendAt, expected model error at the top (deg), with a 10 deg bend toward the right
    [null, 0],
    [0.5, 0],
    [0.65, -3],
    [0.8, -6],
    [0.25, 5],
  ];
  for (const [bendAt, err] of cases) {
    const m = measure(makeDancer({ bend: 10, bendAt, sway: 5 }));
    const tag = `bendAt ${bendAt}`;
    close(m.top - 5 - 10, err, 0.05, `${tag}: top lean`);
    close(m.shoulderTilt, -err, 0.05, `${tag}: shoulders`);
    close(m.elevR, err, 0.05, `${tag}: sway-side (right) elbow`);
    close(m.elevL, -err, 0.05, `${tag}: outside (left) elbow`);
    close(m.headRoll, -err, 0.05, `${tag}: head`);
  }
});
