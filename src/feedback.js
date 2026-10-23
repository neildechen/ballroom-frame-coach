// Latched verdict -> the words on screen. Always the dancer's own left/right.

const deg = (d) => `${Math.abs(d).toFixed(0)}°`;
const side = (dir) => (dir === 'left' ? 'left' : 'right');

const OFF = (id, label) => ({ id, label, value: 'Turned off', tone: 'idle' });
const SHORT = { left: 'Left', right: 'Right', headTilt: 'Tilt', headPos: 'Head', shoulders: 'Shoulders' };

function sideTile(id, name, s) {
  if (s.state === 'off') return OFF(id, name);
  if (s.state === 'untracked') return { id, label: name, value: 'Elbow not visible', tone: 'idle' };
  if (s.state === 'drop') return { id, label: name, value: `${deg(s.elev)} below level`, tone: 'fault' };
  return { id, label: name, value: s.elev >= 0 ? `Level, ${deg(s.elev)} up` : `Level, ${deg(s.elev)} down`, tone: 'ok' };
}

export function feedback(v) {
  if (!v?.tracked) {
    return {
      banner: { text: 'Step into view so both shoulders and elbows are visible', tone: 'idle', instruction: 'Step into view', detail: 'Both shoulders and elbows need to be in the picture' },
      tiles: [],
      sway: '',
      mode: '',
    };
  }
  const h = v.head;
  const tiles = [
    sideTile('left', 'Left side', v.left),
    sideTile('right', 'Right side', v.right),
    h.tilt === 'off' ? OFF('headTilt', 'Head tilt') : h.tilt === 'untracked'
      ? { id: 'headTilt', label: 'Head tilt', value: 'Face not visible', tone: 'idle' }
      : h.tilt === 'ok'
        ? { id: 'headTilt', label: 'Head tilt', value: 'Follows the sway', tone: 'ok' }
        : { id: 'headTilt', label: 'Head tilt', value: `${deg(h.roll)} to your ${side(h.tilt)}`, tone: 'fault' },
    h.shift === 'off' ? OFF('headPos', 'Head position') : h.shift === 'untracked'
      ? { id: 'headPos', label: 'Head position', value: 'Not visible', tone: 'idle' }
      : h.shift === 'ok'
        ? { id: 'headPos', label: 'Head position', value: 'Centred', tone: 'ok' }
        : { id: 'headPos', label: 'Head position', value: `Off centre to your ${side(h.shift)}`, tone: 'fault' },
    v.shoulder.state === 'level-line'
      ? { id: 'shoulders', label: 'Shoulders', value: 'Used as the level line', tone: 'idle' }
      : v.shoulder.state === 'off'
        ? OFF('shoulders', 'Shoulders')
      : v.shoulder.state === 'untracked'
        ? { id: 'shoulders', label: 'Shoulders', value: 'Hips not visible', tone: 'idle' }
        : v.shoulder.state === 'ok'
          ? { id: 'shoulders', label: 'Shoulders', value: 'Square to the body', tone: 'ok' }
          : { id: 'shoulders', label: 'Shoulders', value: `${side(v.shoulder.state)} side low, ${deg(v.shoulder.tilt)}`.replace(/^./, (c) => c.toUpperCase()), tone: 'fault' },
  ];

  const headOff = h.tilt === 'off' && h.shift === 'off';
  const clear = headOff ? 'Frame level' : 'Frame level, head centred';
  // text: the plain finding (Studio). instruction + detail: what to do about it (Glance).
  let text = clear, tone = 'ok', instruction = clear, detail = '';
  const other = (d) => (d === 'left' ? 'right' : 'left');
  if (v.umbrella) {
    text = 'Both sides dropping'; instruction = 'Lift both elbows';
    detail = `Left ${deg(v.left.elev)} and right ${deg(v.right.elev)} below your level line`;
  } else if (v.left.state === 'drop' || v.right.state === 'drop') {
    const s = v.left.state === 'drop' ? 'left' : 'right';
    text = `${s === 'left' ? 'Left' : 'Right'} side dropping`; instruction = `Lift the ${s} elbow`;
    detail = `${deg(v[s].elev)} below your level line`;
  } else if (h.tilt === 'left' || h.tilt === 'right') {
    text = `Head tilted to your ${h.tilt}`; instruction = 'Tilt your head with the sway';
    detail = `${deg(h.roll)} off, toward your ${h.tilt}`;
  } else if (h.shift === 'left' || h.shift === 'right') {
    text = `Head drifting to your ${h.shift}`; instruction = `Bring your head back to your ${other(h.shift)}`;
    detail = `It sits off centre to your ${h.shift}`;
  } else if (v.shoulder.state === 'left' || v.shoulder.state === 'right') {
    text = `${v.shoulder.state === 'left' ? 'Left' : 'Right'} shoulder dropping`; instruction = `Lift the ${v.shoulder.state} shoulder`;
    detail = `${deg(v.shoulder.tilt)} low against your body`;
  }
  if (text !== clear) tone = 'fault';
  for (const t of tiles) t.short = SHORT[t.id];

  const sway = Math.abs(v.sway) < 2 ? 'Upright' : `Sway ${deg(v.sway)} to your ${v.sway > 0 ? 'right' : 'left'}`;
  return { banner: { text, tone, instruction, detail }, tiles, sway, mode: v.mode === 'full' ? 'Full body' : 'Torso only' };
}
