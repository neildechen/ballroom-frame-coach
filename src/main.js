// App shell: camera or demo source -> Session -> canvas overlay + HUD.

import { Session } from './session.js';
import { DEFAULT_TOLERANCES } from './rules.js';
import { feedback } from './feedback.js';
import { drawOverlay, drawStickFigure, contentRect } from './overlay.js';
import { makeDancer } from './synthetic.js';
import { demoAt } from './demo.js';

const $ = (s) => document.querySelector(s);
const video = $('#video');
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');

// ---- settings (per-device convenience only) --------------------------------
const DEFAULTS = {
  mode: 'auto',
  mirror: true,
  rear: false,
  lite: false,
  tol: { frameDeg: DEFAULT_TOLERANCES.frameDeg, headRollDeg: DEFAULT_TOLERANCES.headRollDeg, headOffset: DEFAULT_TOLERANCES.headOffset, shoulderDeg: DEFAULT_TOLERANCES.shoulderDeg },
};
const KEY = 'frame-coach-settings-v2';
function loadSettings() {
  try {
    let s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) {
      // v1 measured head position against the elbows; its headOffset does not carry over.
      s = JSON.parse(localStorage.getItem('frame-coach-settings-v1') || 'null');
      if (s?.tol) delete s.tol.headOffset;
    }
    return s ? { ...DEFAULTS, ...s, tol: { ...DEFAULTS.tol, ...s.tol } } : structuredClone(DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}
const settings = loadSettings();

const session = new Session({ tolerances: settings.tol, tracking: { mode: settings.mode } });

// ---- sources ------------------------------------------------------------------
let source = null; // 'camera' | 'demo'
let tracker = null;
let stream = null;
let wakeLock = null;

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && source) requestWakeLock();
});

async function openCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: settings.rear ? 'environment' : 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  video.srcObject = stream;
  await video.play();
}

async function loadTracker() {
  tracker?.close();
  tracker = null;
  setBanner('Loading the pose model (about 25 MB the first time)', 'idle');
  const { createTracker } = await import('./pose.js');
  tracker = await createTracker({ poseModel: settings.lite ? 'lite' : 'full' });
}

async function startCamera() {
  const err = $('#start-error');
  err.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    err.textContent = 'This browser cannot open the camera here. Open the page over https in Safari or Chrome.';
    err.hidden = false;
    return;
  }
  $('#start').hidden = true;
  try {
    await openCamera();
    source = 'camera';
    $('#caption').hidden = true;
    await loadTracker();
    requestWakeLock();
  } catch (e) {
    source = null;
    $('#start').hidden = false;
    err.textContent = e?.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow the camera for this site in the browser settings, then try again.'
      : `Could not start: ${e?.message || e}`;
    err.hidden = false;
  }
}

function startDemo() {
  $('#start').hidden = true;
  source = 'demo';
  $('#caption').hidden = false;
  requestWakeLock();
}

// ---- HUD --------------------------------------------------------------------
let lastBanner = '';
function setBanner(text, tone) {
  const key = tone + text;
  if (key === lastBanner) return;
  lastBanner = key;
  const b = $('#banner');
  b.textContent = text;
  b.className = `banner ${tone}`;
}

let lastTiles = '';
function renderHud(f) {
  setBanner(f.banner.text, f.banner.tone);
  const modeChip = $('#mode-chip');
  modeChip.textContent = f.mode || 'Looking for you';
  const sway = $('#sway-chip');
  sway.hidden = !f.sway;
  sway.textContent = f.sway;
  const key = JSON.stringify(f.tiles);
  if (key === lastTiles) return;
  lastTiles = key;
  const tiles = $('#tiles');
  tiles.replaceChildren(...f.tiles.map((t) => {
    const el = document.createElement('div');
    el.className = `tile ${t.tone}`;
    el.dataset.id = t.id;
    const k = document.createElement('span'); k.className = 'k'; k.textContent = t.label;
    const v = document.createElement('span'); v.className = 'v'; v.textContent = t.value;
    el.append(k, v);
    return el;
  }));
}

// ---- loop ---------------------------------------------------------------------
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

let frames = 0, fpsT = performance.now();
function tick() {
  const t = performance.now();
  const dpr = fitCanvas();
  ctx.fillStyle = '#0d0f17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let input = null, aspect = 16 / 9;
  if (source === 'camera' && video.readyState >= 2 && video.videoWidth) {
    aspect = video.videoWidth / video.videoHeight;
    const rect = contentRect(canvas.width, canvas.height, aspect);
    ctx.save();
    if (settings.mirror) { ctx.translate(rect.x * 2 + rect.w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    if (tracker) input = { ...tracker.detect(video, t), aspect };
  } else if (source === 'demo') {
    const d = demoAt(t / 1000, { portrait: canvas.height > canvas.width });
    input = makeDancer(d.params);
    aspect = input.aspect;
    const c = $('#caption');
    if (c.textContent !== d.caption) c.textContent = d.caption;
    drawStickFigure(ctx, { rect: contentRect(canvas.width, canvas.height, aspect), aspect, mirror: settings.mirror, pose: input.pose, face: input.face, dpr });
  }

  if (input) {
    const verdict = session.update({ ...input, t });
    drawOverlay(ctx, { rect: contentRect(canvas.width, canvas.height, aspect), aspect, mirror: settings.mirror, verdict, dpr });
    renderHud(feedback(verdict));
    frames++;
    if (t - fpsT > 1000) {
      const fps = $('#fps');
      fps.hidden = false;
      fps.textContent = `${Math.round((frames * 1000) / (t - fpsT))} fps`;
      frames = 0; fpsT = t;
    }
  }
  requestAnimationFrame(tick);
}

// ---- settings sheet ---------------------------------------------------------
const sliders = [
  ['#tol-frame', 'frameDeg', (v) => `${v}°`],
  ['#tol-roll', 'headRollDeg', (v) => `${v}°`],
  ['#tol-offset', 'headOffset', (v) => `${Math.round(v * 100)}% of half your shoulder width`],
  ['#tol-shoulder', 'shoulderDeg', (v) => `${v}°`],
];

function syncSettingsForm() {
  $(`#mode-${settings.mode}`).checked = true;
  $('#mirror').checked = settings.mirror;
  $('#rear').checked = settings.rear;
  $('#lite').checked = settings.lite;
  for (const [sel, key, fmt] of sliders) {
    $(sel).value = settings.tol[key];
    $(`${sel}-out`).textContent = fmt(settings.tol[key]);
  }
}

function applySettings() {
  session.setTolerances(settings.tol);
  session.setTracking({ mode: settings.mode });
  saveSettings();
}

function toggleSettings(open) {
  $('#settings').hidden = !open;
  $('#settings-btn').setAttribute('aria-expanded', String(open));
}

$('#settings-btn').addEventListener('click', () => toggleSettings($('#settings').hidden));
$('#close-settings').addEventListener('click', () => toggleSettings(false));
$('#reset-settings').addEventListener('click', () => {
  Object.assign(settings, structuredClone(DEFAULTS));
  syncSettingsForm();
  applySettings();
});
$('#mode-seg').addEventListener('change', (e) => { settings.mode = e.target.value; applySettings(); });
$('#mirror').addEventListener('change', (e) => { settings.mirror = e.target.checked; applySettings(); });
$('#rear').addEventListener('change', async (e) => {
  settings.rear = e.target.checked;
  settings.mirror = !settings.rear; // a rear camera is not a mirror
  syncSettingsForm();
  applySettings();
  if (source === 'camera') await openCamera().catch(() => {});
});
$('#lite').addEventListener('change', async (e) => {
  settings.lite = e.target.checked;
  applySettings();
  if (source === 'camera') await loadTracker().catch(() => {});
});
for (const [sel, key, fmt] of sliders) {
  $(sel).addEventListener('input', (e) => {
    settings.tol[key] = Number(e.target.value);
    $(`${sel}-out`).textContent = fmt(settings.tol[key]);
    applySettings();
  });
}

$('#start-camera').addEventListener('click', startCamera);
$('#start-demo').addEventListener('click', startDemo);

syncSettingsForm();
if (location.hash === '#demo') startDemo();
requestAnimationFrame(tick);
