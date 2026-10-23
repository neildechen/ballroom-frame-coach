// Latched verdict -> the words on screen. Always the dancer's own left/right.

const deg = (d) => `${Math.abs(d).toFixed(0)}°`;
const side = (dir) => (dir === 'left' ? 'left' : 'right');

function sideTile(id, name, s) {
  if (s.state === 'untracked') return { id, label: name, value: 'Elbow not visible', tone: 'idle' };
  if (s.state === 'drop') return { id, label: name, value: `${deg(s.elev)} below level`, tone: 'fault' };
  return { id, label: name, value: s.elev >= 0 ? `Level, ${deg(s.elev)} up` : `Level, ${deg(s.elev)} down`, tone: 'ok' };
}

export function feedback(v) {
  if (!v?.tracked) {
    return {
      banner: { text: 'Step into view so both shoulders and elbows are visible', tone: 'idle' },
      tiles: [],
      sway: '',
      mode: '',
    };
  }
  const h = v.head;
  const tiles = [
    sideTile('left', 'Left side', v.left),
    sideTile('right', 'Right side', v.right),
    h.tilt === 'untracked'
      ? { id: 'headTilt', label: 'Head tilt', value: 'Face not visible', tone: 'idle' }
      : h.tilt === 'ok'
        ? { id: 'headTilt', label: 'Head tilt', value: 'Follows the sway', tone: 'ok' }
        : { id: 'headTilt', label: 'Head tilt', value: `${deg(h.roll)} to your ${side(h.tilt)}`, tone: 'fault' },
    h.shift === 'untracked'
      ? { id: 'headPos', label: 'Head position', value: 'Not visible', tone: 'idle' }
      : h.shift === 'ok'
        ? { id: 'headPos', label: 'Head position', value: 'Centred', tone: 'ok' }
        : { id: 'headPos', label: 'Head position', value: `Off centre to your ${side(h.shift)}`, tone: 'fault' },
    v.shoulder.state === 'off'
      ? { id: 'shoulders', label: 'Shoulders', value: 'Used as the level line', tone: 'idle' }
      : v.shoulder.state === 'untracked'
        ? { id: 'shoulders', label: 'Shoulders', value: 'Hips not visible', tone: 'idle' }
        : v.shoulder.state === 'ok'
          ? { id: 'shoulders', label: 'Shoulders', value: 'Square to the body', tone: 'ok' }
          : { id: 'shoulders', label: 'Shoulders', value: `${side(v.shoulder.state)} side low, ${deg(v.shoulder.tilt)}`.replace(/^./, (c) => c.toUpperCase()), tone: 'fault' },
  ];

  let text = 'Frame level, head centred', tone = 'ok';
  if (v.umbrella) text = 'Both sides dropping';
  else if (v.left.state === 'drop') text = 'Left side dropping';
  else if (v.right.state === 'drop') text = 'Right side dropping';
  else if (h.tilt === 'left' || h.tilt === 'right') text = `Head tilted to your ${h.tilt}`;
  else if (h.shift === 'left' || h.shift === 'right') text = `Head drifting to your ${h.shift}`;
  else if (v.shoulder.state === 'left' || v.shoulder.state === 'right') text = `${v.shoulder.state === 'left' ? 'Left' : 'Right'} shoulder dropping`;
  if (text !== 'Frame level, head centred') tone = 'fault';

  const sway = Math.abs(v.sway) < 2 ? 'Upright' : `Sway ${deg(v.sway)} to your ${v.sway > 0 ? 'right' : 'left'}`;
  return { banner: { text, tone }, tiles, sway, mode: v.mode === 'full' ? 'Full body' : 'Torso only' };
}
