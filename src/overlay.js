// Draws the measurement overlay on a canvas. Coordinates arrive in world units
// (see geometry.js) and are mapped to the displayed video rectangle.

import { add, sub, scale, len, dot, fromWorld, mid } from './geometry.js';

export const COLORS = {
  ok: '#3ddc97',
  fault: '#ff4d5e',
  guide: '#f2c14e',
  muted: 'rgba(235, 238, 245, 0.55)',
  shadow: 'rgba(8, 10, 18, 0.75)',
};

// Fit a w:h image inside the canvas, centred (object-fit: contain).
export function contentRect(cw, ch, aspect) {
  const w = Math.min(cw, ch * aspect);
  const h = w / aspect;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

export function makeMapper(rect, aspect, mirror) {
  return (p) => {
    const n = fromWorld(p, aspect);
    return { x: rect.x + (mirror ? 1 - n.x : n.x) * rect.w, y: rect.y + n.y * rect.h };
  };
}

function line(ctx, a, b, color, width, dash = null) {
  ctx.save();
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.strokeStyle = COLORS.shadow;
  ctx.lineWidth = width + 4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}

function polyline(ctx, pts, color, width, dash = null) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  for (const [c, w] of [[COLORS.shadow, width + 4], [color, width]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

const sideDeg = (deg) => { const d = Math.round(Math.abs(deg)); return d === 0 ? '0°' : `${d}° ${deg > 0 ? 'R' : 'L'}`; };

function dot2(ctx, p, r, color) {
  ctx.save();
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function ring(ctx, p, r, color, width) {
  ctx.save();
  ctx.strokeStyle = COLORS.shadow; ctx.lineWidth = width + 4;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function label(ctx, p, text, color, px) {
  ctx.save();
  ctx.font = `600 ${px}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = COLORS.shadow;
  ctx.strokeText(text, p.x, p.y);
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}

const isFault = (s) => !['ok', 'untracked', 'off', 'level-line', undefined].includes(s);
const stateColor = (s) => (s === 'ok' ? COLORS.ok : s === 'untracked' || s === 'off' || s === 'level-line' ? COLORS.muted : COLORS.fault);
const fmtDeg = (d) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}°`;

// quiet (Glance look): only faults draw at full strength; everything correct
// or reference-only is drawn faint and thin so the eye goes to the problem.
export function drawOverlay(ctx, { rect, aspect, mirror, verdict, dpr = 1, quiet = false }) {
  const m = verdict?.measurement;
  if (!m?.tracked) return;
  ctx.save();
  const calm = (state) => { ctx.globalAlpha = quiet && !isFault(state) ? 0.45 : 1; };
  const wq = (state, w) => (quiet && !isFault(state) ? w * 0.6 : w);
  const P = m.points, F = m.frame;
  const map = makeMapper(rect, aspect, mirror);
  const k = Math.max(1, rect.h / 720) * dpr; // stroke scale
  const S = F.S, V = F.V; // V: top of the manubrium, where the frame is measured from

  const reach = Math.max(P.LE ? len(sub(P.LE, V)) : 0, P.RE ? len(sub(P.RE, V)) : 0, len(sub(P.LS, P.RS)));

  // Reference: the spine curve from the hips up to the manubrium (full; the head
  // target carries it on), and the level line square to the curve at the manubrium.
  calm('ok');
  if (F.arc) polyline(ctx, Array.from({ length: 17 }, (_, i) => map(F.arc.at((F.sM * i) / 16))), COLORS.guide, 2 * k, [8 * k, 8 * k]);
  // Sway readout just below the body axis (below the hips, or below the shoulders in torso view).
  {
    const base = F.arc ? F.H : add(V, scale(F.u, -len(sub(P.LS, P.RS)) * 0.9));
    const curved = F.arc && Math.abs(m.top - m.sway) >= 1;
    ctx.globalAlpha = 1; // a readout, not a guide: never faded
    label(ctx, map(add(base, scale(F.u, -reach * 0.34))), curved ? `sway ${sideDeg(m.sway)} · top ${sideDeg(m.top)}` : `sway ${sideDeg(m.top)}`, COLORS.guide, 17 * k);
    calm('ok');
  }
  line(ctx, map(add(V, scale(F.hL, -reach * 1.15))), map(add(V, scale(F.hL, reach * 1.15))), COLORS.guide, 2 * k, [8 * k, 8 * k]);

  // Shoulder line (the reference itself in torso mode).
  calm(verdict.shoulder.state);
  const sc = m.mode === 'torso' ? COLORS.guide : verdict.shoulder.state === 'ok' ? COLORS.muted : stateColor(verdict.shoulder.state);
  line(ctx, map(P.LS), map(P.RS), sc, 3 * k);

  // Frame arms.
  for (const [E, side, dir] of [[P.LE, verdict.left, F.hL], [P.RE, verdict.right, scale(F.hL, -1)]]) {
    if (!E) continue;
    const c = stateColor(side.state);
    calm(side.state);
    line(ctx, map(V), map(E), c, wq(side.state, 8 * k));
    dot2(ctx, map(E), wq(side.state, 8 * k), c);
    const tag = add(E, add(scale(dir, reach * 0.12), scale(F.u, reach * 0.14)));
    label(ctx, map(tag), fmtDeg(side.elev), c, 22 * k);
  }
  calm('ok');
  dot2(ctx, map(V), 6 * k, COLORS.guide);

  // Head: ring at the head centre, face axis, and the target: the body axis carried up from the manubrium.
  if (P.C) {
    const r = len(sub(P.LS, P.RS)) * 0.38;
    const tilt = verdict.head.tilt, shift = verdict.head.shift;
    calm(shift);
    const up = dot(sub(P.C, V), F.u);
    const target = add(V, scale(F.u, up));
    line(ctx, map(V), map(add(V, scale(F.u, up + r * 1.4))), stateColor(shift), 2.5 * k, [5 * k, 7 * k]);
    if (shift === 'left' || shift === 'right') line(ctx, map(target), map(P.C), COLORS.fault, 3 * k);
    ring(ctx, map(P.C), r * rect.h, stateColor(shift), 3 * k); // world units are image heights
    if (P.faceAxis) {
      calm(tilt);
      const a = map(add(P.C, scale(P.faceAxis, -r * 1.25)));
      const b = map(add(P.C, scale(P.faceAxis, r * 1.25)));
      line(ctx, a, b, stateColor(tilt), 4 * k);
    }
  }

  ctx.restore();

  // Screen-edge bars on whichever side of the screen a dropping elbow appears.
  ctx.save();
  for (const [E, side] of [[P.LE, verdict.left], [P.RE, verdict.right]]) {
    if (!E || side.state !== 'drop') continue;
    const onLeft = map(E).x < ctx.canvas.width / 2;
    const w = 18 * k;
    const g = ctx.createLinearGradient(onLeft ? 0 : ctx.canvas.width, 0, onLeft ? w * 3 : ctx.canvas.width - w * 3, 0);
    g.addColorStop(0, 'rgba(255, 77, 94, 0.85)');
    g.addColorStop(1, 'rgba(255, 77, 94, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(onLeft ? 0 : ctx.canvas.width - w * 3, 0, w * 3, ctx.canvas.height);
  }
  ctx.restore();
}

// Stick figure for demo mode (the camera feed stands in for this normally).
export function drawStickFigure(ctx, { rect, aspect, mirror, pose, face, dpr = 1, color = 'rgba(160, 170, 200, 0.35)' }) {
  const map = (lm) => ({ x: rect.x + (mirror ? 1 - lm.x : lm.x) * rect.w, y: rect.y + lm.y * rect.h });
  const k = Math.max(1, rect.h / 720) * dpr;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 14 * k;
  ctx.lineCap = 'round';
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(map(pose[a]).x, map(pose[a]).y); ctx.lineTo(map(pose[b]).x, map(pose[b]).y); ctx.stroke(); };
  seg(11, 12); seg(11, 13); seg(12, 14); seg(11, 23); seg(12, 24); seg(23, 24);
  const c = map({ x: (pose[7].x + pose[8].x) / 2, y: (pose[7].y + pose[8].y) / 2 });
  const r = Math.abs(map(pose[7]).x - map(pose[8]).x) / 2 + 0.02 * rect.h;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(r, 0.08 * rect.h), 0, Math.PI * 2); ctx.fill();
  if (face) {
    ctx.fillStyle = 'rgba(220, 225, 240, 0.7)';
    for (const i of [33, 263, 133, 362, 61, 291]) {
      const p = map(face[i]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * k, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
