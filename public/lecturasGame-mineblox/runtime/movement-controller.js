import { withGameVersion } from "../../lecturasGame-build.js";

const [
  utilsModule,
  stateModule,
  inputModule,
  collisionModule,
  simModule,
  cameraModule
] = await Promise.all([
  import(withGameVersion("./movement-utils.js")),
  import(withGameVersion("./movement-state.js")),
  import(withGameVersion("./movement-input.js")),
  import(withGameVersion("./movement-collision.js")),
  import(withGameVersion("./movement-sim.js")),
  import(withGameVersion("./movement-camera.js"))
]);

const {
  FIXED_STEP_SECONDS,
  MAX_SIMULATION_STEPS,
  DEFAULT_LOOK_SENSITIVITY,
  MOVEMENT_TUNING,
  clampPlayerPitch,
  createVector3,
  getProjectedForward,
  isFiniteVector,
  normalizeControlCode,
  isEditableTarget
} = utilsModule;
const { createMovementRuntimeState, resetMovementRuntimeState } = stateModule;
const { createMovementInputController } = inputModule;
const {
  createASCraftCollisionBroadphase,
  COLLISION_MASKS
} = collisionModule;
const { createMovementSimulator } = simModule;
const { createMovementCameraRuntime } = cameraModule;

export { createASCraftCollisionBroadphase };

export function createASCraftMovementController(THREE, options = {}) {
  const state = createMovementRuntimeState(THREE);
  const optionSyncState = typeof options.syncState === "function" ? options.syncState : null;
  const simulator = createMovementSimulator(THREE, {
    MOVEMENT_TUNING,
    clamp01: utilsModule.clamp01,
    dampScalar: utilsModule.dampScalar,
    getProjectedForward
  });
  const cameraRuntime = createMovementCameraRuntime(THREE, {
    MOVEMENT_TUNING,
    clamp01: utilsModule.clamp01,
    dampScalar: utilsModule.dampScalar,
    getProjectedForward,
    isFiniteVector
  });

  function emitState() {
    optionSyncState?.(state);
  }

  const inputController = createMovementInputController({
    state,
    emitState,
    normalizeControlCode,
    isEditableTarget
  });

  function resetMovementState() {
    resetMovementRuntimeState(state);
    emitState();
  }

  function step(frame = {}) {
    const {
      delta = 0,
      document: frameDocument = null,
      renderer = null,
      camera = null,
      roomDoor = null,
      roomShellGroup = null,
      currentRoomId = "",
      playerPosition = null,
      getPlayerSpawnPosition = () => createVector3(THREE, 0, 0, 0),
      getPlanetBlend = () => 0,
      getPlanetSurfaceNormal = () => createVector3(THREE, 0, 1, 0),
      getCubeSurfaceState = null,
      getPlanetFrame = () => ({
        forward: createVector3(THREE, 0, 0, -1),
        right: createVector3(THREE, 1, 0, 0)
      }),
      updateDoorState = () => {},
      updateDestructionEffects = () => {},
      applyCameraOrientation = () => {},
      updateLocalPlayerAvatar = () => {},
      playStepSound = () => {},
      syncState = null
    } = frame;
    const doc = frameDocument || (typeof document !== "undefined" ? document : null);
    if (!renderer || !camera || !playerPosition) return state;

    if (!isFiniteVector(playerPosition)) {
      const safeSpawn = getPlayerSpawnPosition();
      const safeSpawnBlend = getPlanetBlend(safeSpawn);
      const safeSpawnUp = getPlanetSurfaceNormal(safeSpawn, safeSpawnBlend);
      if (typeof getCubeSurfaceState === "function") {
        const cubeState = getCubeSurfaceState(safeSpawn, state.currentCubeFace);
        if (cubeState?.face) state.currentCubeFace = cubeState.face;
      }
      playerPosition.copy(safeSpawn);
      state.velocity.set(0, 0, 0);
      state.playerYaw = 0;
      state.playerPitch = 0;
      state.lookTargetYaw = 0;
      state.lookTargetPitch = 0;
      state.surfaceReferenceUp.copy(safeSpawnUp);
      state.cameraSurfaceUp.copy(safeSpawnUp);
    }

    inputController.syncDirectionalInputFromPressedKeys();

    const pointerLocked = doc?.pointerLockElement === renderer?.domElement;
    const lookSensitivity = pointerLocked ? DEFAULT_LOOK_SENSITIVITY.locked : DEFAULT_LOOK_SENSITIVITY.unlocked;
    if (state.lookInputState.deltaX || state.lookInputState.deltaY) {
      state.lookTargetYaw += state.lookInputState.deltaX * lookSensitivity;
      state.lookTargetPitch = clampPlayerPitch(state.lookTargetPitch - (state.lookInputState.deltaY * lookSensitivity));
      state.lookInputState.deltaX = 0;
      state.lookInputState.deltaY = 0;
    }
    state.playerYaw = state.lookTargetYaw;
    state.playerPitch = state.lookTargetPitch;

    if (roomDoor) updateDoorState(roomDoor, delta);
    updateDestructionEffects(delta);

    const roomReady = !!roomShellGroup;
    if (!currentRoomId || !roomReady) {
      const spawnPosition = getPlayerSpawnPosition();
      if (!state.inFallbackSpawn) {
        playerPosition.copy(spawnPosition);
        camera.position.copy(spawnPosition);
        state.velocity.set(0, 0, 0);
      }
      state.inFallbackSpawn = true;
      const spawnBlend = getPlanetBlend(spawnPosition);
      const spawnSurfaceUp = getPlanetSurfaceNormal(spawnPosition, spawnBlend);
      if (typeof getCubeSurfaceState === "function") {
        const cubeState = getCubeSurfaceState(spawnPosition, state.currentCubeFace);
        if (cubeState?.face) state.currentCubeFace = cubeState.face;
      }
      state.surfaceReferenceUp.copy(spawnSurfaceUp);
      state.surfaceReferenceForward.copy(getProjectedForward(THREE, spawnSurfaceUp, state.surfaceReferenceForward));
      state.cameraSurfaceUp.copy(spawnSurfaceUp);
      const lookDirection = state.surfaceReferenceForward.clone()
        .applyAxisAngle(spawnSurfaceUp, state.playerYaw)
        .multiplyScalar(Math.cos(state.playerPitch))
        .add(spawnSurfaceUp.clone().multiplyScalar(Math.sin(state.playerPitch)))
        .normalize();
      applyCameraOrientation(camera, lookDirection, spawnSurfaceUp);
      updateLocalPlayerAvatar(playerPosition, spawnSurfaceUp, state.surfaceReferenceForward.clone(), false, state);
      state.canJump = true;
      state.isMoving = false;
      const sync = typeof syncState === "function" ? syncState : optionSyncState;
      sync?.(state);
      return state;
    }
    state.inFallbackSpawn = false;

    if (!isFiniteVector(state.currentSimPosition)) {
      state.currentSimPosition.copy(playerPosition);
    }
    if (!isFiniteVector(state.previousSimPosition)) {
      state.previousSimPosition.copy(playerPosition);
    }
    if (!isFiniteVector(state.renderPosition)) {
      state.renderPosition.copy(playerPosition);
    }

    state.accumulator = Math.min(
      state.accumulator + Math.max(0, Number(delta || 0)),
      FIXED_STEP_SECONDS * MAX_SIMULATION_STEPS
    );
    const nowMs = Date.now();
    let stepsRun = 0;
    let simResult = {
      insideRoomVolume: !!state.insideRoomVolumeLatch,
      movedHorizontally: 0,
      hasDirectionalInput: inputController.hasDirectionalMovementInput()
    };

    while (state.accumulator >= FIXED_STEP_SECONDS && stepsRun < MAX_SIMULATION_STEPS) {
      state.previousSimPosition.copy(playerPosition);
      simResult = simulator.step(state, {
        ...frame,
        dt: FIXED_STEP_SECONDS,
        nowMs,
        playerCollisionMask: frame.playerCollisionMask ?? COLLISION_MASKS.playerLocal
      });
      state.currentSimPosition.copy(playerPosition);
      state.accumulator -= FIXED_STEP_SECONDS;
      stepsRun += 1;
    }

    if (stepsRun === 0) {
      state.previousSimPosition.copy(state.currentSimPosition);
      state.currentSimPosition.copy(playerPosition);
    }

    state.interpolationAlpha = FIXED_STEP_SECONDS > 0
      ? Math.max(0, Math.min(1, state.accumulator / FIXED_STEP_SECONDS))
      : 1;
    state.renderPosition
      .copy(state.previousSimPosition)
      .lerp(state.currentSimPosition, state.interpolationAlpha);

    const cameraPose = cameraRuntime.updateCameraPose(state, {
      ...frame,
      delta,
      renderPlayerPosition: state.renderPosition,
      insideRoomVolume: !!simResult.insideRoomVolume
    });
    updateLocalPlayerAvatar(
      state.renderPosition,
      cameraPose.avatarSurfaceUp,
      cameraPose.avatarFacingForward,
      !!simResult.hasDirectionalInput || simResult.movedHorizontally > 0.01,
      state
    );

    const groundedForSteps = !!simResult.insideRoomVolume || !!state.canJump;
    if (
      !state.isSwimming
      && groundedForSteps
      && (!!simResult.hasDirectionalInput || simResult.movedHorizontally > 0.01)
      && simResult.movedHorizontally > 0.01
      && Date.now() - state.lastFootstepAtMs > 280
    ) {
      playStepSound(Math.min(1, simResult.movedHorizontally * 10));
      state.lastFootstepAtMs = Date.now();
    }

    state.isMoving = !!simResult.hasDirectionalInput || simResult.movedHorizontally > 0.01;
    const sync = typeof syncState === "function" ? syncState : optionSyncState;
    sync?.(state);
    return state;
  }

  return {
    state,
    bindControls(bindings = {}) {
      inputController.bindControls({
        ...bindings,
        resetAll: resetMovementState
      });
    },
    resetMovementState,
    hasDirectionalMovementInput: inputController.hasDirectionalMovementInput,
    step
  };
}
