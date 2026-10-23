import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/session.js';
import { makeDancer } from './fixtures.js';

const frames = (session, dancer, t0, t1, fps = 30) => {
  let out;
  for (let t = t0; t <= t1; t += 1000 / fps) out = session.update({ ...makeDancer(dancer), t });
  return out;
};

test('sustained left drop under sway is reported after the enter delay', () => {
  const s = new Session();
  let v = frames(s, { sway: 20 }, 0, 1000);
  assert.equal(v.left.state, 'ok');
  v = frames(s, { sway: 20, elevL: -8 }, 1033, 1100);
  assert.equal(v.left.state, 'ok', 'not yet');
  v = frames(s, { sway: 20, elevL: -8 }, 1133, 1600);
  assert.equal(v.left.state, 'drop');
  assert.equal(v.right.state, 'ok');
  assert.equal(v.umbrella, false);
});

test('both sides down is an umbrella', () => {
  const s = new Session();
  const v = frames(s, { sway: -10, elevL: -9, elevR: -9 }, 0, 1500);
  assert.equal(v.left.state, 'drop');
  assert.equal(v.right.state, 'drop');
  assert.equal(v.umbrella, true);
});

test('a single bad frame does not trigger a fault', () => {
  const s = new Session();
  frames(s, {}, 0, 1000);
  s.update({ ...makeDancer({ elevR: -20 }), t: 1033 });
  const v = frames(s, {}, 1066, 1400);
  assert.equal(v.right.state, 'ok');
});

test('smoothing does not bias a steady reading', () => {
  const s = new Session();
  const v = frames(s, { sway: 25, elevL: 6, elevR: -2, headRoll: 3, headOffset: 0.1 }, 0, 2000);
  assert.ok(Math.abs(v.left.elev - 6) < 1e-6);
  assert.ok(Math.abs(v.right.elev + 2) < 1e-6);
  assert.ok(Math.abs(v.head.roll - 3) < 1e-6);
  assert.ok(Math.abs(v.head.offset - 0.1) < 1e-6);
});

test('head tilt and shift are latched with direction', () => {
  const s = new Session();
  const v = frames(s, { sway: 15, headRoll: -9, headOffset: 0.8 }, 0, 1500);
  assert.equal(v.head.tilt, 'left');
  assert.equal(v.head.shift, 'left');
  const w = frames(s, { sway: 15 }, 1533, 3000);
  assert.equal(w.head.tilt, 'ok');
  assert.equal(w.head.shift, 'ok');
});

test('losing the dancer reports untracked and clears faults', () => {
  const s = new Session();
  frames(s, { elevL: -10 }, 0, 1000);
  const v = s.update({ pose: null, face: null, aspect: 16 / 9, t: 1033 });
  assert.equal(v.tracked, false);
  assert.equal(v.left.state, 'untracked');
});

test('tolerances can be changed live', () => {
  const s = new Session();
  let v = frames(s, { elevL: -2 }, 0, 1000);
  assert.equal(v.left.state, 'ok');
  s.setTolerances({ frameDeg: 0 });
  v = frames(s, { elevL: -2 }, 1033, 2000);
  assert.equal(v.left.state, 'drop');
});

test('a switched-off check never reports, and comes back when switched on', () => {
  const s = new Session({ checks: { left: false, headTilt: false } });
  const bad = { sway: 15, elevL: -9, headRoll: -9 };
  let v = frames(s, bad, 0, 1500);
  assert.equal(v.left.state, 'off');
  assert.equal(v.head.tilt, 'off');
  assert.equal(v.right.state, 'ok', 'other checks keep running');
  s.setChecks({ left: true, headTilt: true });
  v = frames(s, bad, 1533, 3000);
  assert.equal(v.left.state, 'drop');
  assert.equal(v.head.tilt, 'left');
});

test('every check is on by default', () => {
  const v = frames(new Session(), { sway: 10 }, 0, 600);
  for (const st of [v.left.state, v.right.state, v.head.tilt, v.head.shift]) assert.equal(st, 'ok');
  assert.equal(v.shoulder.state, 'info', 'shoulders are on, as information');
});

test('shoulder tilt is reported as information and never raises the banner', () => {
  const s = new Session();
  const v = frames(s, { sway: 15, shoulderTilt: -12 }, 0, 1500);
  assert.equal(v.shoulder.state, 'info');
  assert.ok(Math.abs(v.shoulder.tilt + 12) < 1e-6);
  assert.equal(v.left.state, 'ok');
  assert.equal(v.right.state, 'ok');
  assert.equal(new Session({ checks: { shoulders: false } }).update({ ...makeDancer({}), t: 0 }).shoulder.state, 'off');
});

test('auto view does not flip when hip confidence hovers around the threshold', () => {
  const s = new Session();
  const modes = new Set();
  for (let i = 0; i < 90; i++) {
    const d = makeDancer({});
    const vis = i % 2 ? 0.55 : 0.68;
    for (const k of [23, 24]) d.pose[k].visibility = i < 10 ? 0.95 : vis;
    const v = s.update({ ...d, t: i * 33 });
    if (i >= 10) modes.add(v.mode);
  }
  assert.deepEqual([...modes], ['full']);
});

test('auto view leaves full at once when the hips are lost, and re-enters only after they hold', () => {
  const s = new Session();
  const step = (vis, t) => {
    const d = makeDancer({});
    for (const k of [23, 24]) d.pose[k].visibility = vis;
    return s.update({ ...d, t });
  };
  assert.equal(step(0.95, 0).mode, 'full');
  assert.equal(step(0.2, 33).mode, 'torso', 'hips gone: switch immediately');
  assert.equal(step(0.9, 66).mode, 'torso', 'hips back: not yet');
  assert.equal(step(0.9, 200).mode, 'torso');
  assert.equal(step(0.9, 400).mode, 'full', 'held for 300 ms');
});
