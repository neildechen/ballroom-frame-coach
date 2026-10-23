# Frame Coach

Live camera feedback on an International Standard ballroom frame. It shows whether either side of the frame is dropping and whether the head stays centred and level, all measured against the dancer's own sway.

- Open the app: https://neildechen.github.io/ballroom-frame-coach/
- Demo, no camera needed: https://neildechen.github.io/ballroom-frame-coach/#demo
- User's guide: https://neildechen.github.io/ballroom-frame-coach/guide.html

Everything runs in the browser. Video never leaves the device, and nothing is recorded.

## What it checks

| Check | Passes when | Default tolerance |
|---|---|---|
| Left side, right side | The line from the shoulder midpoint to that elbow is level with the body or above it | may sit 3° below |
| Both sides down | Flags the umbrella frame: both elbows slanting down | same |
| Head tilt | The head's left-right axis (from the eye corners, pupils, mouth corners and cheeks) is parallel to the body's horizontal, so it tilts with the sway | 5° |
| Head position | The head centre (between the ears) sits on the body axis carried up through the shoulder midpoint | 40% of half the shoulder width |
| Shoulders (full body only) | The shoulder line stays square to the body axis | 4° |

Turning the head to the left, as Standard hold asks, is ignored. All tolerances can be changed in Settings, and each check can be switched off there (all are on by default).

## How sway is handled

Every angle is measured in the body's own coordinates, never against the screen.

- **Full body** (hips visible): the body axis runs from the hip midpoint to the shoulder midpoint. "Level" means perpendicular to that axis.
- **Torso only** (hips out of view): the shoulder line is the level line. This mode cannot tell a whole side dropping together (shoulder and elbow) from sway, so the shoulder check is turned off.

Worked example: sway 30° to the right with a correct frame. In the camera image, the right elbow sits 30° below horizontal, the left elbow 30° above, and the head is tilted 30° right. The app reads all three as level. This exact case is a unit test (`test/analyze.test.js`).

Because only body-relative angles are used, results also do not change with camera tilt, a mirrored image or the video's aspect ratio. `test/invariance.test.js` checks this over several thousand generated poses.

## Limits

- The camera should face the dancer. The app measures the plane facing the camera, so elbows held forward or back look shorter, though above-or-below level still reads correctly.
- A side-bend at the waist moves the hip-to-shoulder axis about half as much as it moves the shoulder line, so part of a collapse reads as sway. The shoulder check catches the rest.
- Elbow angles are measured from the shoulder midpoint. An elbow a few centimetres below the shoulder joint reads about 5° low, which is why the default tolerance is 3° and adjustable.
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
