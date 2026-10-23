import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, DEFAULT_TOLERANCES } from '../src/rules.js';

const base = { tracked: true, mode: 'full', sway: 0, elevL: 0, elevR: 0, shoulderTilt: 0, headRoll: 0, headOffset: 0 };
const ev = (m, tol) => evaluate({ ...base, ...m }, tol);

test('defaults match the agreed design', () => {
  assert.deepEqual(
    { ...DEFAULT_TOLERANCES },
    { frameDeg: 3, headRollDeg: 5, headOffset: 0.4, hysteresisDeg: 1, hysteresisOffset: 0.08 },
  );
});

test('a side drops only when it sits below body-horizontal by more than the tolerance', () => {
  assert.equal(ev({ elevL: -2.9 }).leftDrop.fault, false);
  assert.equal(ev({ elevL: -3.1 }).leftDrop.fault, true);
  assert.equal(ev({ elevR: 25 }).rightDrop.fault, false, 'a raised V frame is fine');
  assert.equal(ev({ elevL: -1 }, { frameDeg: 0 }).leftDrop.fault, true, 'strict 0 deg');
});

test('clear threshold sits inside the tolerance by the hysteresis margin', () => {
  const s = ev({ elevL: -2.5 }).leftDrop;
  assert.equal(s.fault, false);
  assert.equal(s.clear, false, 'between -3 and -2 is the hold band');
  assert.equal(ev({ elevL: -1.9 }).leftDrop.clear, true);
});

test('head tilt direction: positive roll means the head leans to the dancer\'s right', () => {
  assert.equal(ev({ headRoll: 7 }).headTilt.dir, 'right');
  assert.equal(ev({ headRoll: -7 }).headTilt.dir, 'left');
  assert.equal(ev({ headRoll: 4 }).headTilt.fault, false);
});

test('head shift direction: positive offset is toward the dancer\'s left', () => {
  assert.equal(ev({ headOffset: 0.5 }).headShift.dir, 'left');
  assert.equal(ev({ headOffset: -0.5 }).headShift.fault, true);
  assert.equal(ev({ headOffset: 0.3 }).headShift.fault, false);
});

test('shoulder is information only: it names the low side but never faults', () => {
  // Neil 2026-10-23: correct sways were flagged on the sway side. The shoulder line
  // against the modelled top of the spine mixes real shoulder movement with the
  // model's error for where the spine bends (test/spine.test.js), so it never faults.
  assert.equal(ev({ shoulderTilt: -5 }).shoulder.dir, 'left', 'left shoulder below body-horizontal');
  assert.equal(ev({ shoulderTilt: 5 }).shoulder.dir, 'right');
  assert.equal(ev({ shoulderTilt: 15 }).shoulder.fault, false);
  assert.equal(ev({ shoulderTilt: -15 }).shoulder.fault, false);
  assert.equal(ev({ mode: 'torso', shoulderTilt: null }).shoulder.value, null);
});

test('null measurements are untracked, never faults', () => {
  const s = ev({ elevL: null, headRoll: null, headOffset: null });
  assert.equal(s.leftDrop.value, null);
  assert.equal(s.leftDrop.fault, false);
  assert.equal(s.headTilt.fault, false);
  assert.equal(s.headShift.fault, false);
});
