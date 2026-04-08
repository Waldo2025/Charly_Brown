export const FIXED_STEP_SECONDS = 1 / 120;
export const MAX_SIMULATION_STEPS = 5;

export const DEFAULT_LOOK_SENSITIVITY = Object.freeze({
  locked: 0.002,
  unlocked: 0.0045
});

export const MOVEMENT_TUNING = Object.freeze({
  walkSpeed: 22,
  sprintSpeed: 29,
  groundAccel: 60,
  airAccel: 26,
  groundDrag: 26,
  airDrag: 10,
  jumpVelocity: 15.4,
  gravityRise: 48,
  gravityFall: 72,
  jumpBufferMs: 140,
  coyoteMs: 120,
  cameraSurfaceFollow: 12,
  thirdPersonDistance: 4.4,
  thirdPersonDistanceMin: 1.55,
  thirdPersonDistanceMax: 5.9,
  thirdPersonSpring: 18,
  thirdPersonTargetSpring: 22
});

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

export function clampPlayerPitch(value) {
  return Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, Number(value || 0)));
}

export function createVector3(THREE, x = 0, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

export function dampScalar(current, target, lambda, delta) {
  if (!Number.isFinite(current)) return Number(target || 0);
  if (!Number.isFinite(target)) return Number(current || 0);
  const alpha = 1 - Math.exp(-Math.max(0, Number(lambda || 0)) * Math.max(0, Number(delta || 0)));
  return current + ((target - current) * alpha);
}

export function isFiniteVector(vec) {
  return !!(
    vec
    && Number.isFinite(vec.x)
    && Number.isFinite(vec.y)
    && Number.isFinite(vec.z)
  );
}

export function getProjectedForward(THREE, upVector, directionHint) {
  const up = (upVector?.clone?.() || createVector3(THREE, 0, 1, 0)).normalize();
  const candidates = [
    directionHint?.clone?.() || createVector3(THREE, 0, 0, -1),
    createVector3(THREE, 0, 0, -1),
    createVector3(THREE, 1, 0, 0),
    createVector3(THREE, 0, 0, 1),
    createVector3(THREE, -1, 0, 0),
    createVector3(THREE, 0, 1, 0),
    createVector3(THREE, 0, -1, 0)
  ];
  for (const candidate of candidates) {
    const forward = candidate.projectOnPlane(up);
    if (forward.lengthSq() > 1e-6) {
      return forward.normalize();
    }
  }
  return createVector3(THREE, 0, 0, -1);
}

export function createInputState() {
  return {
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
    jump: false,
    sprint: false,
    lookX: 0,
    lookY: 0
  };
}

export function createLookState() {
  return {
    pointerId: null,
    lastX: 0,
    lastY: 0,
    deltaX: 0,
    deltaY: 0
  };
}

export function normalizeControlCode(event) {
  const rawCode = String(event?.code || "").trim();
  if (rawCode) {
    const supportedCodes = new Set([
      "ArrowUp",
      "ArrowLeft",
      "ArrowDown",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyE",
      "KeyV",
      "ShiftLeft",
      "ShiftRight",
      "Space"
    ]);
    if (supportedCodes.has(rawCode)) return rawCode;
  }
  const key = String(event?.key || "").trim().toLowerCase();
  if (key === "arrowup" || key === "up") return "ArrowUp";
  if (key === "arrowleft" || key === "left") return "ArrowLeft";
  if (key === "arrowdown" || key === "down") return "ArrowDown";
  if (key === "arrowright" || key === "right") return "ArrowRight";
  if (key === "w") return "KeyW";
  if (key === "a") return "KeyA";
  if (key === "s") return "KeyS";
  if (key === "d") return "KeyD";
  if (key === "e") return "KeyE";
  if (key === "v") return "KeyV";
  if (key === "shift" || key === "shiftleft") return "ShiftLeft";
  if (key === "shiftright") return "ShiftRight";
  if (key === " " || key === "space" || key === "spacebar") return "Space";
  return "";
}

export function isEditableTarget(target) {
  if (!target) return false;
  const tagName = String(target.tagName || "").toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (typeof target.closest === "function") {
    return !!target.closest("input, textarea, select, [contenteditable=\"true\"], [contenteditable=\"\"], .mineblox-modal-content");
  }
  return false;
}
