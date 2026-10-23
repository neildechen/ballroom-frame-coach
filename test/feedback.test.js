import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedback } from '../src/feedback.js';

const v = (o = {}) => ({
  tracked: true, mode: 'full', sway: 0,
  left: { elev: 1, state: 'ok' }, right: { elev: 2, state: 'ok' }, umbrella: false,
  shoulder: { tilt: 0, state: 'ok' },
  head: { roll: 0, offset: 0, source: 'face', tilt: 'ok', shift: 'ok' },
  ...o,
});

test('all good reads as a level frame', () => {
  const f = feedback(v());
  assert.equal(f.banner.tone, 'ok');
  assert.equal(f.banner.text, 'Frame level, head centred');
});

test('umbrella outranks every other fault', () => {
  const f = feedback(v({
    left: { elev: -8, state: 'drop' }, right: { elev: -6, state: 'drop' }, umbrella: true,
    head: { roll: 9, offset: 0, source: 'face', tilt: 'right', shift: 'ok' },
  }));
  assert.equal(f.banner.text, 'Both sides dropping');
  assert.equal(f.banner.tone, 'fault');
});

test('one side dropping names the side and the angle', () => {
  const f = feedback(v({ left: { elev: -6.4, state: 'drop' } }));
  assert.equal(f.banner.text, 'Left side dropping');
  assert.equal(f.tiles.find((t) => t.id === 'left').value, '6° below level');
});

test('head messages use the dancer\'s own left and right', () => {
  const f = feedback(v({ head: { roll: -7.2, offset: 0.22, source: 'face', tilt: 'left', shift: 'left' } }));
  assert.equal(f.banner.text, 'Head tilted to your left');
  assert.equal(f.tiles.find((t) => t.id === 'headTilt').value, '7° to your left');
  assert.equal(f.tiles.find((t) => t.id === 'headPos').value, 'Off centre to your left');
});

test('sway reads in plain words', () => {
  assert.equal(feedback(v({ sway: 12.4 })).sway, 'Sway 12° to your right');
  assert.equal(feedback(v({ sway: -0.8 })).sway, 'Upright');
});

test('torso mode explains the shoulder reference instead of judging it', () => {
  const f = feedback(v({ mode: 'torso', shoulder: { tilt: null, state: 'level-line' } }));
  assert.equal(f.mode, 'Torso only');
  assert.equal(f.tiles.find((t) => t.id === 'shoulders').value, 'Used as the level line');
});

test('nobody in view asks the dancer to step in', () => {
  const f = feedback({ tracked: false });
  assert.equal(f.banner.tone, 'idle');
  assert.match(f.banner.text, /shoulders and elbows/);
});

test('switched-off checks read "Turned off" and never reach the banner', () => {
  const f = feedback(v({ left: { elev: -9, state: 'off' }, head: { roll: 9, offset: 0, source: 'face', tilt: 'off', shift: 'off' }, shoulder: { tilt: 0, state: 'off' } }));
  for (const id of ['left', 'headTilt', 'headPos', 'shoulders']) assert.equal(f.tiles.find((t) => t.id === id).value, 'Turned off', id);
  assert.equal(f.banner.tone, 'ok');
  assert.equal(f.banner.text, 'Frame level');
});

test('each finding comes with an instruction for the Glance look', () => {
  const cases = [
    [{ left: { elev: -9, state: 'drop' } }, 'Lift the left elbow', '9° below your level line'],
    [{ left: { elev: -8, state: 'drop' }, right: { elev: -7, state: 'drop' }, umbrella: true }, 'Lift both elbows', 'Left 8° and right 7° below your level line'],
    [{ head: { roll: 12, offset: 0, source: 'face', tilt: 'left', shift: 'ok' } }, 'Tilt your head with the sway', '12° off, toward your left'],
    [{ head: { roll: 0, offset: 0.6, source: 'face', tilt: 'ok', shift: 'left' } }, 'Bring your head back to your right', 'It sits off centre to your left'],
    [{ shoulder: { tilt: 6, state: 'right' } }, 'Lift the right shoulder', '6° low against your body'],
    [{}, 'Frame level, head centred', ''],
  ];
  for (const [o, instruction, detail] of cases) {
    const b = feedback(v(o)).banner;
    assert.equal(b.instruction, instruction);
    assert.equal(b.detail, detail);
  }
  assert.deepEqual(feedback(v()).tiles.map((t) => t.short), ['Left', 'Right', 'Tilt', 'Head', 'Shoulders']);
});
