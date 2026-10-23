// MediaPipe adapter: video frame -> { pose, face } as plain landmark arrays.
// Everything is vendored (vendor/, models/) so the app runs without a CDN.

import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const here = (p) => new URL(p, import.meta.url).href;

async function create(Task, fileset, model, extra) {
  for (const delegate of ['GPU', 'CPU']) {
    try {
      return await Task.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: here(model), delegate },
        runningMode: 'VIDEO',
        ...extra,
      });
    } catch (err) {
      if (delegate === 'CPU') throw err;
    }
  }
}

export async function createTracker({ poseModel = 'full' } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(here('../vendor/mediapipe/wasm'));
  const [pose, face] = await Promise.all([
    create(PoseLandmarker, fileset, `../models/pose_landmarker_${poseModel}.task`, {
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    create(FaceLandmarker, fileset, '../models/face_landmarker.task', {
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }),
  ]);

  let lastT = -1, frame = 0, lastFace = null, lastFaceT = -Infinity;
  return {
    // The face changes slowly relative to the arms, so it runs every other frame.
    detect(video, tMs) {
      const t = Math.max(tMs, lastT + 1);
      lastT = t;
      const p = pose.detectForVideo(video, t);
      if (frame++ % 2 === 0) {
        const f = face.detectForVideo(video, t);
        lastFace = f.faceLandmarks?.[0] ?? null;
        lastFaceT = t;
      }
      return {
        pose: p.landmarks?.[0] ?? null,
        face: t - lastFaceT < 200 ? lastFace : null,
      };
    },
    close() {
      pose.close();
      face.close();
    },
  };
}
