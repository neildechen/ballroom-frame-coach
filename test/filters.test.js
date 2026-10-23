import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter, Latch } from '../src/filters.js';
import { rng } from './fixtures.js';

test('one-euro filter passes a constant through unchanged', () => {
  const f = new OneEuroFilter();
  let y;
  for (let i = 0; i < 30; i++) y = f.filter(0.42, i / 30);
  assert.ok(Math.abs(y - 0.42) < 1e-12);
});

test('one-euro filter reduces jitter on a still target', () => {
  const f = new OneEuroFilter();
  const r = rng(5);
  let rawVar = 0, outVar = 0;
  for (let i = 0; i < 300; i++) {
    const noise = (r() - 0.5) * 0.01;
    const y = f.filter(0.5 + noise, i / 30);
    if (i > 30) { rawVar += noise ** 2; outVar += (y - 0.5) ** 2; }
  }
  assert.ok(outVar < rawVar * 0.5, `out ${outVar} raw ${rawVar}`);
});

test('one-euro filter follows a step within a few hundred milliseconds', () => {
  const f = new OneEuroFilter();
  for (let i = 0; i < 30; i++) f.filter(0, i / 30);
  let y;
  for (let i = 30; i < 45; i++) y = f.filter(0.2, i / 30); // 0.5 s later
  assert.ok(y > 0.19, `got ${y}`);
});

test('one-euro filter resets after a long gap instead of smearing across it', () => {
  const f = new OneEuroFilter();
  for (let i = 0; i < 30; i++) f.filter(0, i / 30);
  assert.equal(f.filter(1, 5), 1);
});

test('latch enters only after the fault persists', () => {
  const l = new Latch({ enterMs: 150, exitMs: 100 });
  assert.equal(l.update(true, false, 0), false);
  assert.equal(l.update(true, false, 100), false);
  assert.equal(l.update(true, false, 160), true);
});

test('latch ignores a spike shorter than the enter delay', () => {
  const l = new Latch({ enterMs: 150, exitMs: 100 });
  l.update(true, false, 0);
  l.update(false, true, 80);
  assert.equal(l.update(true, false, 200), false);
  assert.equal(l.update(true, false, 300), false);
  assert.equal(l.update(true, false, 360), true);
});

test('latch holds in the band between fault and clear, then exits after the clear persists', () => {
  const l = new Latch({ enterMs: 0, exitMs: 100 });
  assert.equal(l.update(true, false, 0), true);
  assert.equal(l.update(false, false, 500), true, 'hold band');
  assert.equal(l.update(false, true, 600), true);
  assert.equal(l.update(false, true, 710), false);
});

test('latch reset clears state immediately', () => {
  const l = new Latch({ enterMs: 0, exitMs: 100 });
  l.update(true, false, 0);
  l.reset();
  assert.equal(l.on, false);
});
