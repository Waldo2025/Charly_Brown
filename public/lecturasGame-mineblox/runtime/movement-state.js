function createVector3(THREE, x = 0, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function createInputState() {
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

function createLookState() {
  return {
    pointerId: null,
    lastX: 0,
    lastY: 0,
    deltaX: 0,
    deltaY: 0
  };
}

export function createMovementRuntimeState(THREE) {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    canJump: false,
    velocity: createVector3(THREE),
    direction: createVector3(THREE),
    inputState: createInputState(),
    lookInputState: createLookState(),
    playerYaw: 0,
    playerPitch: 0,
    lookTargetYaw: 0,
    lookTargetPitch: 0,
    localPlayerWalkPhase: 0,
    localPlayerWalkBlend: 0,
    isSwimming: false,
    isMoving: false,
    lastFootstepAtMs: 0,
    pressedKeys: new Set(),
    inFallbackSpawn: false,
    jumpQueued: false,
    jumpQueuedAtMs: 0,
    lastGroundedAtMs: 0,
    lastJumpStartedAtMs: 0,
    insideRoomVolumeLatch: true,
    lastVerticalKey: "",
    lastHorizontalKey: "",
    thirdPersonDistance: 4.4,
    surfaceReferenceForward: createVector3(THREE, 0, 0, -1),
    surfaceReferenceUp: createVector3(THREE, 0, 1, 0),
    cameraSurfaceUp: createVector3(THREE, 0, 1, 0),
    currentCubeFace: "top",
    faceTransitionCount: 0,
    cameraRigPosition: createVector3(THREE, NaN, NaN, NaN),
    cameraRigTarget: createVector3(THREE, NaN, NaN, NaN),
    previousSimPosition: createVector3(THREE, NaN, NaN, NaN),
    currentSimPosition: createVector3(THREE, NaN, NaN, NaN),
    renderPosition: createVector3(THREE, NaN, NaN, NaN),
    lastValidPosition: createVector3(THREE, NaN, NaN, NaN),
    debugSurfaceMode: "room",
    debugCollisionFlags: {
      x: false,
      z: false,
      ceiling: false
    },
    debugLastSupport: null,
    interpolationAlpha: 0,
    accumulator: 0,
    _touchTravel: 0,
    _controlsBound: false,
    _unbindControls: null
  };
}

export function resetMovementRuntimeState(state) {
  state.moveForward = false;
  state.moveBackward = false;
  state.moveLeft = false;
  state.moveRight = false;
  state.inputState.forward = 0;
  state.inputState.backward = 0;
  state.inputState.left = 0;
  state.inputState.right = 0;
  state.inputState.sprint = false;
  state.inputState.jump = false;
  state.inputState.lookX = 0;
  state.inputState.lookY = 0;
  state.lookInputState.pointerId = null;
  state.lookInputState.lastX = 0;
  state.lookInputState.lastY = 0;
  state.lookInputState.deltaX = 0;
  state.lookInputState.deltaY = 0;
  state._touchTravel = 0;
  state.lookTargetYaw = state.playerYaw;
  state.lookTargetPitch = state.playerPitch;
  state.velocity.set(0, 0, 0);
  state.direction.set(0, 0, 0);
  state.canJump = false;
  state.jumpQueued = false;
  state.jumpQueuedAtMs = 0;
  state.lastGroundedAtMs = 0;
  state.lastJumpStartedAtMs = 0;
  state.localPlayerWalkPhase = 0;
  state.localPlayerWalkBlend = 0;
  state.isSwimming = false;
  state.isMoving = false;
  state.pressedKeys.clear();
  state.inFallbackSpawn = false;
  state.insideRoomVolumeLatch = true;
  state.lastVerticalKey = "";
  state.lastHorizontalKey = "";
  state.thirdPersonDistance = 4.4;
  state.surfaceReferenceForward.set(0, 0, -1);
  state.surfaceReferenceUp.set(0, 1, 0);
  state.cameraSurfaceUp.set(0, 1, 0);
  state.currentCubeFace = "top";
  state.faceTransitionCount = 0;
  state.cameraRigPosition.set(NaN, NaN, NaN);
  state.cameraRigTarget.set(NaN, NaN, NaN);
  state.previousSimPosition.set(NaN, NaN, NaN);
  state.currentSimPosition.set(NaN, NaN, NaN);
  state.renderPosition.set(NaN, NaN, NaN);
  state.lastValidPosition.set(NaN, NaN, NaN);
  state.debugSurfaceMode = "room";
  state.debugCollisionFlags = {
    x: false,
    z: false,
    ceiling: false
  };
  state.debugLastSupport = null;
  state.interpolationAlpha = 0;
  state.accumulator = 0;
}
