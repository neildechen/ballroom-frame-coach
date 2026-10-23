// Scripted synthetic dancer for demo mode: four 5-second scenes, each swaying
// side to side with the head turned left as in Standard hold: 8 degrees of whole-body
// lean plus 24 degrees of spine curve, so the top of the body tilts 32 degrees.

const SCENE = 5;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const SCENES = [
  { caption: 'Level frame through the sway', apply: () => ({}) },
  { caption: 'Left side drops while swaying', apply: (k) => ({ elevL: -9 * k }) },
  { caption: 'Head stays upright instead of following the sway', apply: (k, top) => ({ headRoll: -top * k }) },
  { caption: 'Both elbows slant down: umbrella frame', apply: (k) => ({ elevL: -8 * k, elevR: -8 * k }) },
];

export function demoAt(tSec, { portrait = false } = {}) {
  const cycle = tSec % (SCENE * SCENES.length);
  const i = Math.floor(cycle / SCENE);
  const local = cycle - i * SCENE;
  const k = ease(local / 0.8) * (1 - ease((local - SCENE + 0.8) / 0.8));
  const wave = Math.sin((2 * Math.PI * tSec) / SCENE);
  const sway = 8 * wave, bend = 24 * wave;
  const params = {
    sway,
    bend,
    elevL: 4,
    elevR: 2,
    headYaw: 25,
    ...(portrait ? { aspect: 9 / 16, size: 0.6, cy: 0.42 } : { aspect: 16 / 9, cy: 0.4, size: 0.85 }),
    ...SCENES[i].apply(k, sway + bend),
  };
  return { params, caption: SCENES[i].caption, scene: i };
}
