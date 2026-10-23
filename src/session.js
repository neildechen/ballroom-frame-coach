// Per-camera-stream state: smoothing -> measurement -> latched verdict.

import { POSE, FACE_PAIRS, FACE_CHEEKS } from './landmarks.js';
import { LandmarkSmoother, Latch } from './filters.js';
import { measure, DEFAULT_TRACKING } from './analyze.js';
import { evaluate, DEFAULT_TOLERANCES } from './rules.js';

const SIGNALS = ['leftDrop', 'rightDrop', 'shoulder', 'headTilt', 'headShift'];

// Checks the dancer can switch off. All on by default.
export const DEFAULT_CHECKS = Object.freeze({ left: true, right: true, headTilt: true, headPos: true, shoulders: true });
const SIGNAL_CHECK = { leftDrop: 'left', rightDrop: 'right', shoulder: 'shoulders', headTilt: 'headTilt', headShift: 'headPos' };

export class Session {
  constructor({ tolerances = {}, tracking = {}, checks = {}, smoothing = {}, timing = {} } = {}) {
    this.checks = { ...DEFAULT_CHECKS, ...checks };
    this.tolerances = { ...DEFAULT_TOLERANCES, ...tolerances };
    this.tracking = { ...DEFAULT_TRACKING, ...tracking };
    this.poseSmoother = new LandmarkSmoother(Object.values(POSE), smoothing);
    this.faceSmoother = new LandmarkSmoother([...FACE_PAIRS.flat(), ...FACE_CHEEKS], smoothing);
    this.latches = Object.fromEntries(SIGNALS.map((k) => [k, new Latch(timing)]));
  }

  setTolerances(t) { this.tolerances = { ...this.tolerances, ...t }; }
  setTracking(t) { this.tracking = { ...this.tracking, ...t }; }
  setChecks(c) { this.checks = { ...this.checks, ...c }; }

  update({ pose, face, aspect, t }) {
    const tSec = t / 1000;
    const sp = this.poseSmoother.apply(pose, tSec);
    const sf = this.faceSmoother.apply(face, tSec);
    const m = measure({ pose: sp, face: sf, aspect }, this.tracking);
    const s = evaluate(m, this.tolerances);

    const on = {};
    const off = (k) => !this.checks[SIGNAL_CHECK[k]];
    for (const k of SIGNALS) {
      if (off(k)) {
        this.latches[k].reset();
        on[k] = 'off';
      } else if (!m.tracked || s[k].value == null) {
        this.latches[k].reset();
        on[k] = null;
      } else {
        on[k] = this.latches[k].update(s[k].fault, s[k].clear, t);
      }
    }
    const side = (k, elev) => ({ elev, state: on[k] === 'off' ? 'off' : on[k] === null ? 'untracked' : on[k] ? 'drop' : 'ok' });
    const dirState = (k) => (on[k] === 'off' ? 'off' : on[k] === null ? 'untracked' : on[k] ? s[k].dir : 'ok');

    const left = side('leftDrop', m.elevL);
    const right = side('rightDrop', m.elevR);
    return {
      tracked: m.tracked,
      mode: m.mode,
      sway: m.sway,
      left,
      right,
      umbrella: left.state === 'drop' && right.state === 'drop',
      shoulder: { tilt: m.shoulderTilt, state: m.mode === 'torso' ? 'level-line' : dirState('shoulder') },
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
