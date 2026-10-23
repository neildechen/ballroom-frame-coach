import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWorld, bodyFrame, sideElevation, faceAxis, signedAngle, norm } from '../src/geometry.js';

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} expected ${b}, got ${a}`);

test('toWorld corrects aspect ratio and flips y', () => {
  // A segment that is 45 degrees in pixels on a 16:9 image is NOT 45 degrees in normalized units.
  const a = toWorld({ x: 0.5, y: 0.5 }, 16 / 9);
  const b = toWorld({ x: 0.5 + 0.1 * (9 / 16), y: 0.4 }, 16 / 9);
  close(signedAngle({ x: b.x - a.x, y: b.y - a.y }, { x: 1, y: 0 }, { x: 0, y: 1 }), 45, 1e-9);
});

test('signedAngle measures in the given axes', () => {
  close(signedAngle({ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }), 90);
  close(signedAngle({ x: 1, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }), -45);
});

test('full-mode body frame: axis from hips, horizontal toward the dancer\'s left', () => {
  const w = { LS: { x: 1, y: 0 }, RS: { x: -1, y: 0 }, LH: { x: 0.8, y: -3 }, RH: { x: -0.8, y: -3 } };
  const f = bodyFrame(w, 'full');
  close(f.u.x, 0); close(f.u.y, 1);
  close(f.hL.x, 1); close(f.hL.y, 0);
  // mirrored image: dancer's left is now image-left
  const m = bodyFrame({ LS: { x: -1, y: 0 }, RS: { x: 1, y: 0 }, LH: { x: -0.8, y: -3 }, RH: { x: 0.8, y: -3 } }, 'full');
  close(m.hL.x, -1); close(m.u.y, 1);
});

test('torso-mode body frame: horizontal is the shoulder line, up points toward the head', () => {
  const s = Math.SQRT1_2;
  const w = { LS: { x: s, y: s }, RS: { x: -s, y: -s }, C: { x: -1, y: 1 } };
  const f = bodyFrame(w, 'torso');
  close(f.hL.x, s); close(f.hL.y, s);
  close(f.u.x, -s); close(f.u.y, s);
  // same shoulders, mirrored handedness: u must still point toward the head
  const g = bodyFrame({ LS: { x: -s, y: -s }, RS: { x: s, y: s }, C: { x: -1, y: 1 } }, 'torso');
  close(g.u.x, -s); close(g.u.y, s);
});

test('sideElevation is positive above body-horizontal and negative below', () => {
  const S = { x: 0, y: 0 }, u = { x: 0, y: 1 }, hL = { x: 1, y: 0 };
  close(sideElevation({ x: 1, y: Math.tan(Math.PI / 18) }, S, u, hL), 10);
  close(sideElevation({ x: -1, y: -Math.tan(Math.PI / 36) }, S, u, { x: -1, y: 0 }), -5);
});

test('faceAxis averages the left-minus-right directions of face pairs', () => {
  const pts = [
    [{ x: 1, y: 0.1 }, { x: -1, y: -0.1 }],
    [{ x: 0.5, y: 0.05 }, { x: -0.5, y: -0.05 }],
  ];
  const a = faceAxis(pts);
  const e = norm({ x: 1, y: 0.1 });
  close(a.x, e.x); close(a.y, e.y);
  assert.equal(faceAxis([]), null);
});
