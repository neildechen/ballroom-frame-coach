// MediaPipe landmark indices used by the app. "Left"/"right" are the dancer's
// anatomical sides, as MediaPipe reports them.

export const POSE = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

export const POSE_COUNT = 33;

// Face mesh (478 points). Symmetric pairs as [dancer's left, dancer's right]:
// outer eye corners, inner eye corners, mouth corners, face edge at the cheeks.
// Their averaged left-minus-right direction is the face's left-right axis.
export const FACE_PAIRS = [
  [263, 33],
  [362, 133],
  [291, 61],
  [454, 234],
];

export const FACE_CHEEKS = [454, 234];
export const FACE_COUNT = 478;
