export function createMovementCameraRuntime(THREE, helpers = {}) {
  const {
    MOVEMENT_TUNING,
    clamp01,
    dampScalar,
    getProjectedForward,
    isFiniteVector
  } = helpers;

  const tempSurfaceUp = new THREE.Vector3();
  const tempLookDirection = new THREE.Vector3();
  const tempThirdPersonTarget = new THREE.Vector3();
  const tempDesiredPos = new THREE.Vector3();
  const tempOrbitDirection = new THREE.Vector3();
  const tempForward = new THREE.Vector3();
  const tempAvatarForward = new THREE.Vector3();
  const tempCameraVector = new THREE.Vector3();

  function updateCameraPose(state, frame = {}) {
    const {
      delta = 0,
      camera = null,
      playerPosition = null,
      renderPlayerPosition = null,
      playerViewMode = "first",
      insideRoomVolume = false,
      getPlanetBlend = () => 0,
      getPlanetSurfaceNormal = () => tempSurfaceUp.set(0, 1, 0),
      applyCameraOrientation = () => {}
    } = frame;

    const visiblePlayerPosition = renderPlayerPosition || playerPosition;
    if (!camera || !playerPosition || !visiblePlayerPosition) {
      return {
        renderSurfaceUp: tempSurfaceUp.set(0, 1, 0),
        avatarSurfaceUp: tempSurfaceUp.set(0, 1, 0),
        avatarFacingForward: tempAvatarForward.set(0, 0, -1)
      };
    }

    const isThirdPersonMode = playerViewMode === "third" || playerViewMode === "third_front";
    const isFrontThirdPerson = playerViewMode === "third_front";
    const finalSurfaceUp = insideRoomVolume
      ? tempSurfaceUp.set(0, 1, 0)
      : tempSurfaceUp.copy(getPlanetSurfaceNormal(playerPosition, getPlanetBlend(playerPosition)));
    if (finalSurfaceUp.lengthSq() < 1e-6) {
      finalSurfaceUp.set(0, 1, 0);
    } else {
      finalSurfaceUp.normalize();
    }

    state.cameraSurfaceUp.lerp(finalSurfaceUp, Math.min(1, delta * MOVEMENT_TUNING.cameraSurfaceFollow));
    if (state.cameraSurfaceUp.lengthSq() < 1e-6) {
      state.cameraSurfaceUp.copy(finalSurfaceUp);
    } else {
      state.cameraSurfaceUp.normalize();
    }

    const renderSurfaceUp = insideRoomVolume
      ? finalSurfaceUp.clone()
      : (isThirdPersonMode ? state.cameraSurfaceUp.clone() : finalSurfaceUp.clone());
    const renderBaseForward = getProjectedForward(THREE, renderSurfaceUp, state.surfaceReferenceForward);
    const facingForward = tempForward.copy(renderBaseForward).applyAxisAngle(renderSurfaceUp, state.playerYaw).normalize();
    tempLookDirection.copy(facingForward)
      .multiplyScalar(Math.cos(state.playerPitch))
      .addScaledVector(renderSurfaceUp, Math.sin(state.playerPitch))
      .normalize();

    if (isThirdPersonMode) {
      const pitchRange = Math.PI / 2 - 0.05;
      const pitchNormalized = Math.max(-1, Math.min(1, state.playerPitch / pitchRange));
      const pitchUpFactor = clamp01(pitchNormalized);
      const pitchDownFactor = clamp01(-pitchNormalized);
      const preferredDistance = THREE.MathUtils.lerp(
        MOVEMENT_TUNING.thirdPersonDistanceMax - (pitchUpFactor * 0.9),
        MOVEMENT_TUNING.thirdPersonDistanceMin,
        pitchDownFactor
      );
      state.thirdPersonDistance = dampScalar(
        state.thirdPersonDistance || MOVEMENT_TUNING.thirdPersonDistance,
        preferredDistance,
        14,
        delta
      );

      const characterFacingForward = isFrontThirdPerson
        ? tempAvatarForward.copy(facingForward).multiplyScalar(-1)
        : tempAvatarForward.copy(facingForward);
      const targetLead = isFrontThirdPerson ? -0.26 : 0.34;
      tempThirdPersonTarget
        .copy(visiblePlayerPosition)
        .addScaledVector(renderSurfaceUp, THREE.MathUtils.lerp(0.96, 1.18, pitchUpFactor))
        .addScaledVector(characterFacingForward, targetLead);
      tempOrbitDirection
        .copy(isFrontThirdPerson ? characterFacingForward : characterFacingForward.clone().multiplyScalar(-1))
        .multiplyScalar(Math.cos(state.playerPitch))
        .addScaledVector(renderSurfaceUp, Math.sin(state.playerPitch))
        .normalize();
      tempDesiredPos.copy(tempThirdPersonTarget).addScaledVector(tempOrbitDirection, state.thirdPersonDistance);

      if (!isFiniteVector(state.cameraRigPosition)) {
        state.cameraRigPosition.copy(tempDesiredPos);
      } else {
        state.cameraRigPosition.lerp(tempDesiredPos, 1 - Math.exp(-delta * MOVEMENT_TUNING.thirdPersonSpring));
      }
      if (!isFiniteVector(state.cameraRigTarget)) {
        state.cameraRigTarget.copy(tempThirdPersonTarget);
      } else {
        state.cameraRigTarget.lerp(tempThirdPersonTarget, 1 - Math.exp(-delta * MOVEMENT_TUNING.thirdPersonTargetSpring));
      }
      camera.position.copy(state.cameraRigPosition);
      tempCameraVector.copy(state.cameraRigTarget).sub(camera.position);
      applyCameraOrientation(camera, tempCameraVector, renderSurfaceUp);
    } else {
      state.thirdPersonDistance = MOVEMENT_TUNING.thirdPersonDistance;
      state.cameraRigPosition.copy(visiblePlayerPosition);
      state.cameraRigTarget.copy(visiblePlayerPosition);
      camera.position.copy(visiblePlayerPosition);
      applyCameraOrientation(camera, tempLookDirection, renderSurfaceUp);
    }

    const avatarSurfaceUp = insideRoomVolume ? renderSurfaceUp.clone() : finalSurfaceUp.clone();
    const avatarBaseForward = getProjectedForward(THREE, avatarSurfaceUp, state.surfaceReferenceForward);
    const avatarFacingForward = isThirdPersonMode
      ? avatarBaseForward.applyAxisAngle(avatarSurfaceUp, state.playerYaw).normalize()
      : facingForward.clone();
    if (isThirdPersonMode && isFrontThirdPerson) {
      avatarFacingForward.multiplyScalar(-1);
    }
    avatarFacingForward.projectOnPlane(avatarSurfaceUp);
    if (avatarFacingForward.lengthSq() < 1e-6) {
      avatarFacingForward.copy(getProjectedForward(THREE, avatarSurfaceUp, state.surfaceReferenceForward));
    } else {
      avatarFacingForward.normalize();
    }

    return {
      renderSurfaceUp,
      avatarSurfaceUp,
      avatarFacingForward
    };
  }

  return {
    updateCameraPose
  };
}
