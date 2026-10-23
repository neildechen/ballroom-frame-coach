// The head target drawn on screen must start at the shoulder midpoint and pass
// through a centred head, whatever the sway, mirroring or elbow placement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawOverlay, contentRect, makeMapper } from '../src/overlay.js';
import { measure } from '../src/analyze.js';
import { Session } from '../src/session.js';
import { POSE } from '../src/landmarks.js';
import { makeDancer } from './fixtures.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

// Canvas stand-in that records each stroked path with its dash pattern.
function recorder(width, height) {
  const strokes = [];
  let dash = [], path = [];
  const gradient = { addColorStop() {} };
  return {
    strokes,
    canvas: { width, height },
    save() {}, restore() {}, setLineDash(d) { dash = d; }, beginPath() { path = []; },
    moveTo(x, y) { path.push({ x, y }); }, lineTo(x, y) { path.push({ x, y }); },
    stroke() { strokes.push({ dash: [...dash], path: [...path] }); },
    arc() {}, fill() {}, fillRect() {}, strokeText() {}, fillText() {},
    createLinearGradient() { return gradient; },
  };
}

function render(d, mirror) {
  const s = new Session();
  let verdict;
  for (let t = 0; t <= 600; t += 33) verdict = s.update({ ...d, t });
  const ctx = recorder(1280, 720);
  const rect = contentRect(1280, 720, d.aspect);
  drawOverlay(ctx, { rect, aspect: d.aspect, mirror, verdict });
  const k = Math.max(1, rect.h / 720);
  const target = ctx.strokes.find((st) => st.dash.length === 2 && st.dash[0] === 5 * k);
  return { target, map: makeMapper(rect, d.aspect, mirror), m: verdict.measurement };
}

// Distance from point p to the infinite line through a and b (screen pixels).
const offLine = (p, a, b) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);

for (const hipsVisible of [true, false]) {
  test(`${hipsVisible ? 'full' : 'torso'} mode: head target rises from the shoulder midpoint through a centred head`, () => {
    for (const sway of [-25, -10, 0, 12, 30]) for (const mirror of [false, true]) {
      const d = makeDancer({ sway, hipsVisible, headYaw: 25, aspect: 9 / 16, cx: 0.5, cy: 0.45 });
      // An asymmetric hold: push the left elbow well out, pull the right one in.
      const S = { x: (d.pose[POSE.LEFT_SHOULDER].x + d.pose[POSE.RIGHT_SHOULDER].x) / 2, y: (d.pose[POSE.LEFT_SHOULDER].y + d.pose[POSE.RIGHT_SHOULDER].y) / 2 };
      for (const [i, f] of [[POSE.LEFT_ELBOW, 1.5], [POSE.RIGHT_ELBOW, 0.7]]) {
        const e = d.pose[i];
        d.pose[i] = { ...e, x: S.x + (e.x - S.x) * f, y: S.y + (e.y - S.y) * f };
      }
      const tag = `sway=${sway} mirror=${mirror}`;
      const { target, map, m } = render(d, mirror);
      assert.ok(target, `head target drawn ${tag}`);
      close(m.headOffset, 0, 1e-6, `headOffset ${tag}`);
      const [a, b] = target.path;
      const s = map(m.frame.S), c = map(m.points.C);
      close(a.x, s.x, 1e-6, `starts at S (x) ${tag}`);
      close(a.y, s.y, 1e-6, `starts at S (y) ${tag}`);
      close(offLine(c, a, b), 0, 1e-6, `passes through the head ${tag}`);
      assert.ok(b.y < c.y, `reaches above the head centre ${tag}`);
    }
  });
}

test('a head off the axis by the given share of half the shoulder width is read as such', () => {
  for (const off of [-0.6, 0.3, 0.9]) {
    const m = measure(makeDancer({ sway: 18, headOffset: off, elevL: 10, elevR: -4, mirror: true }));
    close(m.headOffset, off, 1e-6, `offset ${off}`);
  }
});
