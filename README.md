# Frame Coach

Live camera feedback on an International Standard ballroom frame. It shows whether either side of the frame is dropping and whether the head stays centred and level, all measured against the dancer's own sway.

- Open the app: https://neildechen.github.io/ballroom-frame-coach/
- Demo, no camera needed: https://neildechen.github.io/ballroom-frame-coach/#demo
- User's guide: https://neildechen.github.io/ballroom-frame-coach/guide.html

Everything runs in the browser. Video never leaves the device, and nothing is recorded.

## What it checks

| Check | Passes when | Default tolerance |
|---|---|---|
| Left side, right side | The line from the top of the manubrium to that elbow is square to the spine there, or above it | may sit 3° below |
| Both sides down | Flags the umbrella frame: both elbows slanting down | same |
| Head tilt | The head's left-right axis (from the eye corners, pupils, mouth corners and cheeks) is parallel to the body's horizontal, so it tilts with the sway | 5° |
| Head position | The head centre (between the ears) sits on the spine's direction carried up from the manubrium | 40% of half the shoulder width |
| Shoulders (full body only) | Information only: the shoulder line's tilt against the spine at the manubrium. Never a fault (see Limits) | none |

Turning the head to the left, as Standard hold asks, is ignored. All tolerances can be changed in Settings, and each check can be switched off there (all are on by default). Settings also has a light or dark theme (light by default) and two looks: Studio, with every reading, and Glance, with one large instruction readable from across the room.

Auto view switches to full body only after the hips have been clearly visible for 0.3 seconds, and back to torso as soon as they are lost, so it does not flicker between the two.

## How sway is handled

Every angle is measured in the body's own coordinates, never against the screen.

- **Full body** (hips visible): the spine is modelled as one smooth curve (a circular arc) from the hip midpoint to the shoulder midpoint, leaving the pelvis square to it. "Level" means square to the curve at the top of the manubrium, where the frame is measured from. For such an arc the straight hips-to-shoulders line sits halfway between the two ends' directions, so with the pelvis level a 15° straight-line sway puts the top at 30°; a whole body tilted rigidly, pelvis included, has no curve and the two agree. The app shows both ("sway 15° R · top 30° R").
  - **Standing:** the pelvis direction comes from the hip line.
  - **Sitting:** a chair holds the pelvis upright, so it is taken as vertical in the picture. This assumes the camera is level. The hip line is not used, which also makes sitting the steadier reading.
  - The app switches between the two from the knees: thighs hanging down (knees well below the hips) is standing, thighs pointing at the camera is sitting. A switch needs 0.7 s of agreement; with the knees out of view the last choice holds.
- **Torso only** (hips out of view): the shoulder line is the level line, measured at the top of the manubrium. This mode cannot tell a whole side dropping together (shoulder and elbow) from sway, and there is no shoulder reading.

**The frame's anchor.** In a good Standard hold the upper arms are raised 90° from the side, so the elbows sit level with the shoulder joints and the line between them crosses the sternum at the shoulder midpoint's height, the top of the manubrium. That point is where each arm's angle is measured from, so a perfect frame reads 0° on both sides (`MANUBRIUM_DROP` in `src/geometry.js`).

Worked example: sway 30° to the right with a correct frame. In the camera image, the right elbow sits 30° below horizontal, the left elbow 30° above, and the head is tilted 30° right. The app reads all three as level. This exact case is a unit test (`test/analyze.test.js`); the curved-spine cases are in `test/spine.test.js`.

Because only body-relative angles are used, results also do not change with camera tilt (except when sitting, which takes the camera as level), a mirrored image or the video's aspect ratio. The sway numbers themselves are leans from the picture's vertical, so a tilted phone shows in them. `test/invariance.test.js` checks this over several thousand generated poses.

## Limits

- The camera should face the dancer. The app measures the plane facing the camera, so elbows held forward or back look shorter, though above-or-below level still reads correctly.
- The curve is one even arc. A spine that bends mostly in one place is read as the even arc with the same ends, so the top angle is an estimate. With a 10° bend the error is 0° when the bend is centred at mid-torso, about 3° (sway side reads low) at the diaphragm, 6° at the upper back, and 5° the other way low in the lumbar spine (`test/spine.test.js`, "known limit"). The elbows, the head and the shoulder reading share it, which is why the shoulder reading is information only.
- Standing, every degree of error in the tracked hip line moves the elbow readings by a degree. MediaPipe's hip points are its least precise; smoothing helps, and the 3° tolerance covers some of it.
- The arm angle is measured from the shoulder midpoint's height, the level of a 90° hold. An elbow held lower than the shoulder joint reads low by that much.
- Tracking quality depends on light, clothing contrast and distance. Low-confidence points show as "not visible" and never as faults.

## Layout

```
src/geometry.js   2D vector math and the body frame (no browser code)
src/analyze.js    one frame of landmarks -> raw angles and offsets
src/rules.js      tolerances -> fault / clear signals for each check
src/filters.js    landmark smoothing (one-euro filter) and fault timing (latch)
src/session.js    smoothing + measuring + latching for a live stream
src/feedback.js   verdict -> on-screen wording
src/synthetic.js  generated dancers, shared by the tests and the demo
src/demo.js       scripted demo scenes
src/pose.js       MediaPipe adapter (pose + face landmarks)
src/overlay.js    canvas drawing
src/main.js       app shell
test/             node --test suites
vendor/, models/  MediaPipe Tasks Vision 0.10.35 and its models, served locally
```

Conventions: "left" and "right" always mean the dancer's own sides. World coordinates are x right, y up, in units of image height. Angles are in degrees.

A fault appears after it has held for 150 ms and clears after the reading has been back inside its tolerance (minus a 1° margin) for 100 ms. This stops flicker.

## Development

```
npm test          # unit and property tests, no dependencies
npm run serve     # http://localhost:8000 (camera works on localhost)
```

Camera access needs https or localhost. GitHub Pages serves this repo's `main` branch.

## Licences

App code: MIT. `vendor/mediapipe` and `models/` are Google's MediaPipe Tasks Vision runtime and models, Apache-2.0 (https://github.com/google-ai-edge/mediapipe).
