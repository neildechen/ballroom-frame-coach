// Property tests for the core requirement: verdicts do not depend on sway,
// camera roll, mirroring, aspect ratio or where the dancer stands in the frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure } from '../src/analyze.js';
import { makeDancer, rng } from './fixtures.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

function* cases(seed, n, torso) {
  const r = rng(seed);
  const pick = (lo, hi) => lo + (hi - lo) * r();
  for (let i = 0; i < n; i++) {
    yield {
      elevL: pick(-15, 20),
      elevR: pick(-15, 20),
      shoulderTilt: torso ? 0 : pick(-8, 8),
      headRoll: pick(-12, 12),
      headYaw: pick(-45, 45),
      headPitch: pick(-15, 15),
      headOffset: pick(-0.4, 0.4),
      hipsVisible: !torso,
      bend: torso ? 0 : pick(-30, 30),
      size: torso ? 1 : 0.7, // keeps the hips in the picture at the largest combined leans
    };
  }
}

const SWAYS = [-35, -20, -8, 0, 5, 17, 30];
const CAMERA = [-15, 0, 9];
const ASPECTS = [16 / 9, 9 / 16, 4 / 3];

for (const torso of [false, true]) {
  test(`${torso ? 'torso' : 'full'} mode: measurements are invariant to sway, camera roll, mirror and aspect`, () => {
    let checked = 0;
    for (const body of cases(torso ? 7 : 3, 25, torso)) {
      for (const sway of SWAYS) for (const cameraRoll of CAMERA) for (const mirror of [false, true]) {
        const aspect = ASPECTS[checked % ASPECTS.length];
        const m = measure(makeDancer({ ...body, sway, cameraRoll, mirror, aspect }));
        const tag = `${JSON.stringify(body)} sway=${sway} cam=${cameraRoll} mirror=${mirror}`;
        assert.equal(m.mode, torso ? 'torso' : 'full', tag);
        close(m.elevL, body.elevL, 1e-6, `elevL ${tag}`);
        close(m.elevR, body.elevR, 1e-6, `elevR ${tag}`);
        close(m.headRoll, body.headRoll, 1e-6, `headRoll ${tag}`);
        close(m.headOffset, body.headOffset, 1e-6, `headOffset ${tag}`);
        if (!torso) close(m.shoulderTilt, body.shoulderTilt, 1e-6, `shoulderTilt ${tag}`);
        if (!torso) close(m.bend, body.bend, 1e-6, `bend ${tag}`);
        checked++;
      }
    }
    assert.ok(checked > 1000);
  });
}

test('sway reading itself follows the body, corrected for mirroring', () => {
  for (const s of SWAYS) {
    close(measure(makeDancer({ sway: s })).sway, s, 1e-6, 'plain');
    close(measure(makeDancer({ sway: s, mirror: true })).sway, s, 1e-6, 'mirrored');
  }
});
