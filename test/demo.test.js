import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoAt, SCENES } from '../src/demo.js';
import { Session } from '../src/session.js';
import { makeDancer } from '../src/synthetic.js';

// Run the scripted demo through the real pipeline and check each scene shows
// the fault it claims to show (and only the level scene stays clean).
test('each demo scene produces the verdict its caption describes', () => {
  const s = new Session();
  const seen = SCENES.map(() => new Set());
  for (let t = 0; t < 20; t += 1 / 30) {
    const { params, scene } = demoAt(t);
    const v = s.update({ ...makeDancer(params), t: t * 1000 });
    const local = t % 5;
    if (local < 1.2 || local > 4.0) continue; // skip ramps
    if (v.left.state === 'drop') seen[scene].add('left');
    if (v.right.state === 'drop') seen[scene].add('right');
    if (v.head.tilt !== 'ok') seen[scene].add('tilt');
    if (v.head.shift !== 'ok') seen[scene].add('shift');
  }
  assert.deepEqual([...seen[0]], []);
  assert.deepEqual([...seen[1]], ['left']);
  assert.ok(seen[2].has('tilt') && !seen[2].has('left') && !seen[2].has('right'));
  assert.deepEqual([...seen[3]].sort(), ['left', 'right']);
});
