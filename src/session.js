// Per-camera-stream state: smoothing -> measurement -> latched verdict.

import { POSE, FACE_PAIRS, FACE_CHEEKS } from './landmarks.js';
import { LandmarkSmoother, Latch } from './filters.js';
import { measure, DEFAULT_TRACKING } from './analyze.js';
import { evaluate, DEFAULT_TOLERANCES } from './rules.js';

const SIGNALS = ['leftDrop', 'rightDrop', 'shoulder', 'headTilt', 'headShift'];

export class Session {
  constructor({ tolerances = {}, tracking = {}, smoothing = {}, timing = {} } = {}) {
    this.tolerances = { ...DEFAULT_TOLERANCES, ...tolerances };
    this.tracking = { ...DEFAULT_TRACKING, ...tracking };
    this.poseSmoother = new LandmarkSmoother(Object.values(POSE), smoothing);
    this.faceSmoother = new LandmarkSmoother([...FACE_PAIRS.flat(), ...FACE_CHEEKS], smoothing);
    this.latches = Object.fromEntries(SIGNALS.map((k) => [k, new Latch(timing)]));
  }

  setTolerances(t) { this.tolerances = { ...this.tolerances, ...t }; }
  setTracking(t) { this.tracking = { ...this.tracking, ...t }; }

  update({ pose, face, aspect, t }) {
    const tSec = t / 1000;
    const sp = this.poseSmoother.apply(pose, tSec);
    const sf = this.faceSmoother.apply(face, tSec);
    const m = measure({ pose: sp, face: sf, aspect }, this.tracking);
    const s = evaluate(m, this.tolerances);

    const on = {};
    for (const k of SIGNALS) {
      if (!m.tracked || s[k].value == null) {
        this.latches[k].reset();
        on[k] = null;
      } else {
        on[k] = this.latches[k].update(s[k].fault, s[k].clear, t);
      }
    }
    const side = (k, elev) => ({ elev, state: on[k] === null ? 'untracked' : on[k] ? 'drop' : 'ok' });
    const dirState = (k) => (on[k] === null ? 'untracked' : on[k] ? s[k].dir : 'ok');

    const left = side('leftDrop', m.elevL);
    const right = side('rightDrop', m.elevR);
    return {
      tracked: m.tracked,
      mode: m.mode,
      sway: m.sway,
      left,
      right,
      umbrella: left.state === 'drop' && right.state === 'drop',
      shoulder: { tilt: m.shoulderTilt, state: m.mode === 'torso' ? 'off' : dirState('shoulder') },
      head: {
        roll: m.headRoll,
        offset: m.headOffset,
        source: m.headSource,
        tilt: dirState('headTilt'),
        shift: dirState('headShift'),
      },
      measurement: m,
    };
  }
}
