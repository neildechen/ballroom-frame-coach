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
