export function createMovementSimulator(THREE, helpers = {}) {
  const {
    MOVEMENT_TUNING,
    clamp01,
    dampScalar,
    getProjectedForward
  } = helpers;

  const tempMoveVector = new THREE.Vector3();
  const tempHorizontalVelocity = new THREE.Vector3();
  const tempNextPos = new THREE.Vector3();
  const tempPlanetOffset = new THREE.Vector3();
  const tempHorizontalTravel = new THREE.Vector3();
  const tempColliderCenter = new THREE.Vector3();
  const tempGravityUp = new THREE.Vector3();
  const tempFacingRight = new THREE.Vector3();
  const tempGroundHorizontal = new THREE.Vector3();
  const tempForwardFallback = new THREE.Vector3();
  const tempTravel = new THREE.Vector3();
  const tempEarthBoundaryVector = new THREE.Vector3();
  const tempSupportPoint = new THREE.Vector3();
  const tempSupportNormal = new THREE.Vector3();
  const tempSupportOffset = new THREE.Vector3();
  const tempSupportDelta = new THREE.Vector3();
  const tempWaterSampleA = new THREE.Vector3();
  const tempWaterSampleB = new THREE.Vector3();
  const tempWaterSampleC = new THREE.Vector3();

  function cloneSupportState(supportState = null) {
    if (!supportState) return null;
    const supportPoint = supportState.supportPoint?.clone?.();
    const supportNormal = supportState.supportNormal?.clone?.();
    return {
      ...supportState,
      supportPoint,
      supportNormal
    };
  }

  function getSupportDistanceAlongNormal(position, supportState) {
    const supportPoint = supportState?.supportPoint;
    const supportNormal = supportState?.supportNormal;
    if (!supportPoint || !supportNormal) return Number.POSITIVE_INFINITY;
    tempSupportDelta.copy(position).sub(supportPoint);
    return tempSupportDelta.dot(supportNormal);
  }

  function snapPositionToSupport(position, supportState, eyeHeight) {
    const supportPoint = supportState?.supportPoint;
    const supportNormal = supportState?.supportNormal;
    if (!supportPoint || !supportNormal) return false;
    tempSupportOffset.copy(supportNormal).normalize().multiplyScalar(eyeHeight);
    position.copy(tempSupportPoint.copy(supportPoint).add(tempSupportOffset));
    return true;
  }

  function transportSurfaceReferenceForward(state, nextUp) {
    const safeNextUp = nextUp?.clone?.();
    if (!safeNextUp || safeNextUp.lengthSq() < 1e-6) return;
    safeNextUp.normalize();
    const previousUp = state.surfaceReferenceUp?.clone?.() || new THREE.Vector3(0, 1, 0);
    if (previousUp.lengthSq() > 1e-6) {
      previousUp.normalize();
      const transportAxis = new THREE.Vector3().crossVectors(previousUp, safeNextUp);
      const transportAngle = previousUp.angleTo(safeNextUp);
      if (transportAxis.lengthSq() > 1e-8 && transportAngle > 1e-5) {
        state.surfaceReferenceForward.applyAxisAngle(transportAxis.normalize(), transportAngle);
      }
    }
    state.surfaceReferenceForward.projectOnPlane(safeNextUp);
    if (state.surfaceReferenceForward.lengthSq() < 1e-6) {
      state.surfaceReferenceForward.set(0, 0, -1).projectOnPlane(safeNextUp);
    }
    if (state.surfaceReferenceForward.lengthSq() < 1e-6) {
      state.surfaceReferenceForward.set(1, 0, 0).projectOnPlane(safeNextUp);
    }
    if (state.surfaceReferenceForward.lengthSq() > 1e-6) {
      state.surfaceReferenceForward.normalize();
    }
    state.surfaceReferenceUp.copy(safeNextUp);
  }

  function getCollisionCandidates(frame, nextPos) {
    const queryRadius = Math.max(frame.playerRadius + 1.2, frame.stepUpHeight + 0.5);
    if (frame.collisionBroadphase?.query) {
      return frame.collisionBroadphase.query(nextPos, queryRadius, {
        actorType: "playerLocal",
        mask: frame.playerCollisionMask,
        placedItems: frame.placedItems,
        getCollisionBox: frame.getPlacedItemCollisionBox
      });
    }
    return frame.placedItems instanceof Map ? Array.from(frame.placedItems.values()) : [];
  }

  function getLocalAxisInfoFromUp(gravUp) {
    const gx = Math.abs(gravUp.x);
    const gy = Math.abs(gravUp.y);
    const gz = Math.abs(gravUp.z);
    if (gx >= gy && gx >= gz) return { upAxis: "x", upSign: Math.sign(gravUp.x) || 1, h1: "y", h2: "z" };
    if (gz >= gx && gz >= gy) return { upAxis: "z", upSign: Math.sign(gravUp.z) || 1, h1: "x", h2: "y" };
    return { upAxis: "y", upSign: Math.sign(gravUp.y) || 1, h1: "x", h2: "z" };
  }

  function getWaterSubmersionLevel(position, gravityUp, eyeHeight, isWaterWorldVoxelAt) {
    if (typeof isWaterWorldVoxelAt !== "function") return 0;
    const up = gravityUp?.clone?.();
    if (!up || up.lengthSq() < 1e-6) return 0;
    up.normalize();
    const feetOffset = Math.max(0.2, eyeHeight - 0.25);
    const torsoOffset = Math.max(0.18, eyeHeight * 0.48);
    tempWaterSampleA.copy(position).addScaledVector(up, -feetOffset);
    tempWaterSampleB.copy(position).addScaledVector(up, -torsoOffset);
    tempWaterSampleC.copy(position).addScaledVector(up, 0.08);
    let hits = 0;
    if (isWaterWorldVoxelAt(tempWaterSampleA.x, tempWaterSampleA.y, tempWaterSampleA.z)) hits += 1;
    if (isWaterWorldVoxelAt(tempWaterSampleB.x, tempWaterSampleB.y, tempWaterSampleB.z)) hits += 1;
    if (isWaterWorldVoxelAt(tempWaterSampleC.x, tempWaterSampleC.y, tempWaterSampleC.z)) hits += 1;
    return hits / 3;
  }

  function isFiniteVec3(vec) {
    return !!vec
      && Number.isFinite(vec.x)
      && Number.isFinite(vec.y)
      && Number.isFinite(vec.z);
  }

  function step(state, frame = {}) {
    const {
      dt,
      nowMs,
      playerPosition,
      playerViewMode = "first",
      currentRoomId = "",
      roomDoor = null,
      roomShellGroup = null,
      roomWidth = 30,
      roomDepth = 30,
      roomHeight = 10,
      playerRadius = 0.35,
      playerEyeHeight = 1.6,
      playerTopOffset = 0.25,
      roomFloorY = 0,
      stepUpHeight = 0.8,
      recessMode = false,
      isTeacher = false,
      placedItems = new Map(),
      seatedState = { active: false, targetId: null, position: null },
      exitSeatedState = () => {},
      getPlanetBlend = () => 0,
      getPlanetSurfaceNormal = () => tempGravityUp.set(0, 1, 0),
      getCubeSurfaceState = null,
      getPlanetFrame = () => ({
        forward: tempForwardFallback.set(0, 0, -1),
        right: tempFacingRight.set(1, 0, 0)
      }),
      getPlanetCenter = () => tempPlanetOffset.set(0, -72, 0),
      getPlanetEyeRadius = () => 73.6,
      getEarthWalkableSurfaceY = () => null,
      getEarthWalkableSurfaceNormal = () => tempGravityUp.set(0, 1, 0),
      getEarthSurfaceSupportState = () => null,
      getEarthSurfaceSupportStateAtPosition = () => null,
      isEarthSurfaceSampleInsideRadius = () => true,
      getClampedEarthSurfaceSample = (x, z) => ({ x, z, clamped: false }),
      activeCelestialBody = "earth",
      playerCollisionMask = null,
      findTerrainSupportYAt = () => null,
      getTerrainVoxelContact = () => ({
        collisionX: false,
        collisionZ: false,
        collisionH1: false,
        collisionH2: false,
        supportY: null
      }),
      getPlacedItemCollisionBox = () => null,
      isWaterWorldVoxelAt = () => false
    } = frame;

    if (!isFiniteVec3(playerPosition)) {
      const lastValid = state.lastValidPosition;
      if (isFiniteVec3(lastValid)) {
        playerPosition.copy(lastValid);
      } else {
        const resetCenter = getPlanetCenter();
        const resetUp = (activeCelestialBody === "earth" && typeof getCubeSurfaceState === "function")
          ? (getCubeSurfaceState(new THREE.Vector3(0, 0, 0), state.currentCubeFace)?.up?.clone?.() || new THREE.Vector3(0, 1, 0))
          : new THREE.Vector3(0, 1, 0);
        if (resetUp.lengthSq() < 1e-6) resetUp.set(0, 1, 0);
        resetUp.normalize();
        playerPosition.copy(resetCenter).addScaledVector(resetUp, getPlanetEyeRadius());
      }
      state.velocity.set(0, 0, 0);
      state.canJump = true;
      state.lastGroundedAtMs = nowMs;
    }
    if (!isFiniteVec3(state.velocity)) {
      state.velocity.set(0, 0, 0);
    }
    if (!isFiniteVec3(state.lastValidPosition)) {
      state.lastValidPosition.copy(playerPosition);
    }
    const previousPlayerPosition = tempTravel.copy(playerPosition);
    const hasDirectionalInput = !!(
      state.inputState.forward
      || state.inputState.backward
      || state.inputState.left
      || state.inputState.right
    );

    const seatedMeshAtStart = seatedState.targetId ? placedItems.get(seatedState.targetId) : null;
    const seatedVehicleActive = !!(seatedMeshAtStart?.userData?.isVehicle);
    if (seatedState.active && !seatedVehicleActive && (hasDirectionalInput || state.jumpQueued)) {
      exitSeatedState();
      seatedState.active = false;
    }

    const roomHalfX = roomWidth / 2 - playerRadius;
    const roomHalfZ = roomDepth / 2 - playerRadius;
    const roomStandY = roomFloorY + 0.5;
    const roomCeilingY = roomStandY + roomHeight;
    const roomSupportHalfX = roomHalfX + 0.9;
    const roomSupportHalfZ = roomHalfZ + 0.9;
    const roomEnterMargin = 0.25;
    const roomExitMargin = 0.75;
    const playerFeetY = playerPosition.y - playerEyeHeight;
    const roomFloorEnterMin = roomStandY - 3.25;
    const roomInteriorFeetMax = roomCeilingY - 1.05;
    const canEnterRoomVolume = Math.abs(playerPosition.x) <= (roomHalfX - roomEnterMargin)
      && Math.abs(playerPosition.z) <= (roomHalfZ - roomEnterMargin)
      && playerFeetY >= roomFloorEnterMin
      && playerFeetY < roomInteriorFeetMax;
    const canStayInRoomVolume = Math.abs(playerPosition.x) <= (roomHalfX + roomExitMargin)
      && Math.abs(playerPosition.z) <= (roomHalfZ + roomExitMargin)
      && playerFeetY >= roomFloorEnterMin
      && playerFeetY < roomInteriorFeetMax;
    if (state.insideRoomVolumeLatch) {
      if (!canStayInRoomVolume) state.insideRoomVolumeLatch = false;
    } else if (canEnterRoomVolume) {
      state.insideRoomVolumeLatch = true;
    }
    const insideRoomVolume = state.insideRoomVolumeLatch;

    const planetBlend = getPlanetBlend(playerPosition);
    const cubeSurfaceState = (activeCelestialBody === "earth" && typeof getCubeSurfaceState === "function")
      ? getCubeSurfaceState(playerPosition, state.currentCubeFace)
      : null;
    if (cubeSurfaceState?.face) {
      const prevFace = state.currentCubeFace;
      if (prevFace && prevFace !== cubeSurfaceState.face) {
        state.faceTransitionCount = Number(state.faceTransitionCount || 0) + 1;
      }
      state.currentCubeFace = cubeSurfaceState.face;
    }
    const useEarthWalkableSurface = false; // Disabling heightmap physics on Earth unlocks true 3D cubic gravity and wall walking!
    const earthCurrentSupportState = useEarthWalkableSurface
      ? cloneSupportState(getEarthSurfaceSupportStateAtPosition(playerPosition))
      : null;
    const gravityUp = insideRoomVolume
      ? tempGravityUp.set(0, 1, 0)
      : tempGravityUp.copy(
        useEarthWalkableSurface
          ? (earthCurrentSupportState?.supportNormal
            || getEarthWalkableSurfaceNormal(playerPosition.x, playerPosition.z))
          : (cubeSurfaceState?.up || getPlanetSurfaceNormal(playerPosition, planetBlend))
      );
    if (gravityUp.lengthSq() < 1e-6) {
      gravityUp.set(0, 1, 0);
    } else {
      gravityUp.normalize();
    }
    transportSurfaceReferenceForward(state, gravityUp);

    const locomotionYaw = state.lookTargetYaw;
    const planetFrame = useEarthWalkableSurface
      ? {
        forward: getProjectedForward(THREE, gravityUp, state.surfaceReferenceForward),
        right: tempFacingRight.set(1, 0, 0)
      }
      : (
        cubeSurfaceState
          ? {
            forward: cubeSurfaceState.tangentForward?.clone?.() || getProjectedForward(THREE, gravityUp, state.surfaceReferenceForward),
            right: cubeSurfaceState.tangentRight?.clone?.() || tempFacingRight.set(1, 0, 0)
          }
          : getPlanetFrame(playerPosition, locomotionYaw, planetBlend, state.surfaceReferenceForward)
      );
    const frameForward = planetFrame?.forward?.clone?.() || state.surfaceReferenceForward.clone();
    const facingForward = frameForward.applyAxisAngle(gravityUp, locomotionYaw).normalize();
    if (facingForward.lengthSq() < 1e-6) {
      facingForward.copy(getProjectedForward(THREE, gravityUp, state.surfaceReferenceForward));
    }
    tempFacingRight.crossVectors(facingForward, gravityUp).normalize();

    if (seatedState.active) {
      const seatedMesh = seatedState.targetId ? placedItems.get(seatedState.targetId) : null;
      if (!seatedMesh) {
        exitSeatedState();
      } else {
        if (state.jumpQueued && !seatedMesh?.userData?.vehicleLockSeat) {
          exitSeatedState();
          seatedState.active = false;
          state.jumpQueued = false;
          state.jumpQueuedAtMs = 0;
        } else {
        const seatPosition = seatedMesh.userData.seatPosition?.clone?.()
          || seatedState.position?.clone?.()
          || playerPosition.clone();
        seatedState.position = seatPosition;
        playerPosition.copy(seatPosition);
        state.isSwimming = false;
        state.canJump = false;
        state.jumpQueued = false;
        state.inputState.jump = false;
        state.velocity.set(0, 0, 0);
        state.isMoving = false;
        return {
          insideRoomVolume,
          movedHorizontally: 0,
          hasDirectionalInput: false,
          isSwimming: false
        };
        }
      }
    }

    const rawInputZ = state.inputState.forward - state.inputState.backward;
    const rawInputX = state.inputState.right - state.inputState.left;
    const rawInputMagnitude = Math.hypot(rawInputX, rawInputZ);
    const normalizedInputX = rawInputMagnitude > 1e-6 ? rawInputX / rawInputMagnitude : 0;
    const normalizedInputZ = rawInputMagnitude > 1e-6 ? rawInputZ / rawInputMagnitude : 0;
    state.direction.set(normalizedInputX, 0, normalizedInputZ);
    const isFrontThirdPerson = playerViewMode === "third_front";
    const directionZ = isFrontThirdPerson ? -normalizedInputZ : normalizedInputZ;
    const directionX = isFrontThirdPerson ? -normalizedInputX : normalizedInputX;
    tempMoveVector.copy(facingForward).multiplyScalar(directionZ).addScaledVector(tempFacingRight, directionX);
    const hasMovementInput = tempMoveVector.lengthSq() > 1e-6;

    if (state.jumpQueued && state.jumpQueuedAtMs > 0 && (nowMs - state.jumpQueuedAtMs) > MOVEMENT_TUNING.jumpBufferMs) {
      state.jumpQueued = false;
      state.jumpQueuedAtMs = 0;
    }

    const groundedRecently = state.canJump
      || (state.lastGroundedAtMs > 0 && (nowMs - state.lastGroundedAtMs) <= MOVEMENT_TUNING.coyoteMs);
    const waterSubmersion = (!insideRoomVolume && activeCelestialBody === "earth")
      ? getWaterSubmersionLevel(playerPosition, gravityUp, playerEyeHeight, isWaterWorldVoxelAt)
      : 0;
    const isSwimming = waterSubmersion >= 0.34;
    state.isSwimming = isSwimming;

    if (state.jumpQueued && groundedRecently && !seatedState.active && !isSwimming) {
      const currentVerticalSpeed = state.velocity.dot(gravityUp);
      const jumpDelta = MOVEMENT_TUNING.jumpVelocity - currentVerticalSpeed;
      if (jumpDelta > 0) {
        state.velocity.addScaledVector(gravityUp, jumpDelta);
      }
      state.canJump = false;
      state.jumpQueued = false;
      state.jumpQueuedAtMs = 0;
      state.lastJumpStartedAtMs = nowMs;
    }

    const targetSpeed = isSwimming
      ? (state.inputState.sprint ? 10 : 7)
      : (state.inputState.sprint ? MOVEMENT_TUNING.sprintSpeed : MOVEMENT_TUNING.walkSpeed);
    if (hasMovementInput) {
      tempMoveVector.normalize().multiplyScalar(targetSpeed);
    }

    const verticalSpeed = state.velocity.dot(gravityUp);
    const horizontalVelocity = tempHorizontalVelocity.copy(state.velocity).addScaledVector(gravityUp, -verticalSpeed);
    if (hasMovementInput) {
      const accelBase = isSwimming
        ? 18
        : (state.canJump ? MOVEMENT_TUNING.groundAccel : MOVEMENT_TUNING.airAccel);
      const accel = 1 - Math.exp(-dt * accelBase);
      horizontalVelocity.lerp(tempMoveVector, accel);
    } else {
      const dragBase = isSwimming
        ? 7.5
        : (state.canJump ? MOVEMENT_TUNING.groundDrag : MOVEMENT_TUNING.airDrag);
      const drag = Math.exp(-dt * dragBase);
      horizontalVelocity.multiplyScalar(drag);
      if (horizontalVelocity.lengthSq() < 0.0004) {
        horizontalVelocity.set(0, 0, 0);
      }
    }

    let nextVerticalSpeed = 0;
    if (isSwimming) {
      const neutralizedVertical = verticalSpeed * Math.exp(-dt * 4.5);
      const gravityDampen = MOVEMENT_TUNING.gravityFall * dt * 0.16;
      let swimLiftImpulse = 0;
      if (state.inputState.jump) swimLiftImpulse += 8.6;
      if (state.inputState.sprint && !state.inputState.jump) swimLiftImpulse -= 5.6;
      nextVerticalSpeed = THREE.MathUtils.clamp(
        neutralizedVertical - gravityDampen + (swimLiftImpulse * dt * 4),
        -10,
        10
      );
    } else {
      const gravityStrength = verticalSpeed > 0 && state.inputState.jump
        ? MOVEMENT_TUNING.gravityRise
        : MOVEMENT_TUNING.gravityFall;
      nextVerticalSpeed = verticalSpeed - (gravityStrength * dt);
    }
    state.velocity.copy(horizontalVelocity).addScaledVector(gravityUp, nextVerticalSpeed);
    if (!isFiniteVec3(state.velocity)) {
      state.velocity.set(0, 0, 0);
    } else {
      const maxAllowedSpeed = isSwimming ? 22 : 34;
      if (state.velocity.lengthSq() > (maxAllowedSpeed * maxAllowedSpeed)) {
        state.velocity.setLength(maxAllowedSpeed);
      }
    }

    const nextPos = tempNextPos.copy(playerPosition).addScaledVector(state.velocity, dt);
    if (!isFiniteVec3(nextPos)) {
      nextPos.copy(previousPlayerPosition);
      state.velocity.set(0, 0, 0);
    }
    const planetCenter = getPlanetCenter();
    const planetOffset = tempPlanetOffset.copy(nextPos).sub(planetCenter);
    const isCubeWorld = activeCelestialBody === "earth";
    const planetDistance = isCubeWorld
      ? Math.max(Math.abs(planetOffset.x), Math.abs(planetOffset.y), Math.abs(planetOffset.z))
      : planetOffset.length();
    const eyeRadius = getPlanetEyeRadius();
    const minPlanetDistance = eyeRadius - 60;
    // Allow climbing high structures like pyramids (buffer 60 units)
    const maxPlanetDistanceAllowed = eyeRadius + 60.0;

    if (!insideRoomVolume && planetDistance < minPlanetDistance) {
      const scale = minPlanetDistance / Math.max(0.0001, planetDistance);
      nextPos.copy(planetCenter).add(planetOffset.clone().multiplyScalar(scale));
      tempGroundHorizontal.copy(state.velocity).projectOnPlane(gravityUp);
      state.velocity.copy(tempGroundHorizontal);
      state.canJump = true;
      state.lastGroundedAtMs = nowMs;
    } else if (!insideRoomVolume && planetDistance > maxPlanetDistanceAllowed) {
      // Hard snap only if way outside bounds
      const scale = eyeRadius / Math.max(0.0001, planetDistance);
      nextPos.copy(planetCenter).add(planetOffset.clone().multiplyScalar(scale));
      const outwardVel = state.velocity.dot(gravityUp);
      if (outwardVel > 0) state.velocity.addScaledVector(gravityUp, -outwardVel);
      state.canJump = true;
      state.lastGroundedAtMs = nowMs;
    }

    const locParams = getLocalAxisInfoFromUp(cubeSurfaceState?.up || gravityUp);
    const getLocalP = (vec, axis) => (axis === 'up' ? vec[locParams.upAxis] * locParams.upSign : vec[locParams[axis]]);
    const setLocalP = (vec, axis, val) => { if (axis === 'up') vec[locParams.upAxis] = val * locParams.upSign; else vec[locParams[axis]] = val; };
    const getLocalMin = (box, axis) => (axis === 'up' ? (locParams.upSign > 0 ? box.min[locParams.upAxis] : -box.max[locParams.upAxis]) : box.min[locParams[axis]]);
    const getLocalMax = (box, axis) => (axis === 'up' ? (locParams.upSign > 0 ? box.max[locParams.upAxis] : -box.min[locParams.upAxis]) : box.max[locParams[axis]]);

    let collisionH1 = false;
    let collisionH2 = false;
    let outdoorSupportState = useEarthWalkableSurface
      ? cloneSupportState(getEarthSurfaceSupportStateAtPosition(nextPos))
      : null;
    const earthWalkableSupportY = useEarthWalkableSurface
      ? (outdoorSupportState?.supportY ?? getEarthWalkableSurfaceY(nextPos.x, nextPos.z))
      : null;
    const terrainSupportY = useEarthWalkableSurface
      ? earthWalkableSupportY
      : findTerrainSupportYAt(nextPos.x, nextPos.z, nextPos.y, 24); // To do: fix findTerrainSupportYAt for full 3D if needed, or rely on mesh bounds
      
    const localSupportUp = terrainSupportY !== null ? terrainSupportY : -Infinity;
    const playerBottom = getLocalP(nextPos, 'up') - playerEyeHeight;
    const playerTop = getLocalP(nextPos, 'up') + playerTopOffset;
    const ceilingLimit = (roomCeilingY - 1) - playerTopOffset - 0.05;
    let collisionCeiling = false;

    // Room constraint is always Y-up - only apply if gravity aligns with room
    if (insideRoomVolume && locParams.upAxis === 'y' && getLocalP(nextPos, 'up') + playerTopOffset > ceilingLimit) {
      setLocalP(nextPos, 'up', ceilingLimit - playerTopOffset);
      tempGroundHorizontal.copy(state.velocity).projectOnPlane(tempGravityUp.set(0, 1, 0));
      state.velocity.copy(tempGroundHorizontal);
      collisionCeiling = true;
    }

    const withinRoomFloorSupportZone = Math.abs(nextPos.x) <= roomSupportHalfX
      && Math.abs(nextPos.z) <= roomSupportHalfZ
      && (nextPos.y - playerEyeHeight) >= (roomStandY - 3.2)
      && (nextPos.y - playerEyeHeight) <= (roomCeilingY + 1.2);

    let supportY;
    if (insideRoomVolume || withinRoomFloorSupportZone) {
      if (locParams.upAxis === 'y' && locParams.upSign > 0) {
        if (localSupportUp === -Infinity) supportY = roomStandY;
        else supportY = Math.max(localSupportUp, roomStandY);
      } else {
        supportY = localSupportUp;
      }
    } else {
      supportY = localSupportUp;
    }

    const candidates = insideRoomVolume
      ? []
      : getCollisionCandidates({
        collisionBroadphase: frame.collisionBroadphase,
        placedItems,
        getPlacedItemCollisionBox,
        playerCollisionMask,
        playerRadius,
        stepUpHeight
      }, nextPos);

    candidates.forEach((mesh) => {
      if (mesh?.userData?.isDoor && (mesh.userData.doorOpenProgress || 0) > 0.5) return;
      const box = getPlacedItemCollisionBox(mesh);
      if (!box) return;
      
      const padding = mesh.userData.collisionPadding ?? 0.05;
      const h1Pos = getLocalP(nextPos, 'h1');
      const h2Pos = getLocalP(nextPos, 'h2');
      
      const expandedMinH1 = getLocalMin(box, 'h1') - playerRadius - padding;
      const expandedMaxH1 = getLocalMax(box, 'h1') + playerRadius + padding;
      const expandedMinH2 = getLocalMin(box, 'h2') - playerRadius - padding;
      const expandedMaxH2 = getLocalMax(box, 'h2') + playerRadius + padding;
      
      const overlapsHorizontal = h1Pos >= expandedMinH1 && h1Pos <= expandedMaxH1 && h2Pos >= expandedMinH2 && h2Pos <= expandedMaxH2;
      if (!overlapsHorizontal) return;

      const topY = getLocalMax(box, 'up'); // ignore collisionTop override since we rotationally adapt
      const bottomY = getLocalMin(box, 'up');
      const standingDelta = playerBottom - topY;
      const intersectsVertically = playerTop > bottomY && playerBottom < topY;
      const stepSnapDepth = Number.isFinite(mesh?.userData?.stepSnapDepth)
        ? Math.max(0.18, Number(mesh.userData.stepSnapDepth))
        : 0.18;

      if ((mesh.userData.isStepable || mesh.userData.isSeatable) && standingDelta >= -stepSnapDepth && standingDelta <= stepUpHeight) {
        supportY = Math.max(supportY, topY);
        if (mesh.userData.isSeatable) {
          seatedState.position = mesh.userData.seatPosition?.clone?.()
            || new THREE.Vector3(mesh.position.x, topY + 0.32, mesh.position.z);
        }
      } else if (intersectsVertically) {
        const centerH1 = (getLocalMin(box, 'h1') + getLocalMax(box, 'h1')) * 0.5;
        const centerH2 = (getLocalMin(box, 'h2') + getLocalMax(box, 'h2')) * 0.5;
        const pushOutH1 = Math.min(Math.abs(expandedMaxH1 - h1Pos), Math.abs(h1Pos - expandedMinH1));
        const pushOutH2 = Math.min(Math.abs(expandedMaxH2 - h2Pos), Math.abs(h2Pos - expandedMinH2));
        if (pushOutH1 <= pushOutH2) {
          setLocalP(nextPos, 'h1', h1Pos < centerH1 ? expandedMinH1 : expandedMaxH1);
          collisionH1 = true;
        } else {
          setLocalP(nextPos, 'h2', h2Pos < centerH2 ? expandedMinH2 : expandedMaxH2);
          collisionH2 = true;
        }
      }
    });

    if (!insideRoomVolume) {
      const terrainReferenceSupportY = outdoorSupportState?.supportPoint ? getLocalP(outdoorSupportState.supportPoint, 'up') : supportY;
      const terrainContact = getTerrainVoxelContact(nextPos, terrainReferenceSupportY);
      const terrainCollisionH1 = !!(
        terrainContact?.collisionH1
        || (locParams.h1 === "x" ? terrainContact?.collisionX : (locParams.h1 === "z" ? terrainContact?.collisionZ : false))
      );
      const terrainCollisionH2 = !!(
        terrainContact?.collisionH2
        || (locParams.h2 === "x" ? terrainContact?.collisionX : (locParams.h2 === "z" ? terrainContact?.collisionZ : false))
      );
      const nearTerrainSupport = terrainContact.supportY !== null
        && Math.abs(playerBottom - terrainContact.supportY) <= (isSwimming ? 2.8 : 1.75);
      if (!nearTerrainSupport) {
        if (terrainCollisionH1) collisionH1 = true;
        if (terrainCollisionH2) collisionH2 = true;
      }
      if (terrainContact.supportY !== null) {
        supportY = Math.max(supportY, terrainContact.supportY);
      }
    }

    if (insideRoomVolume) {
      const shellHalfX = roomWidth / 2 - playerRadius;
      const shellHalfZ = roomDepth / 2 - playerRadius;
      const doorwayHalfWidth = 1.08;
      const doorwayHeight = 4.15;
      const doorProgress = Number(roomDoor?.userData?.doorOpenProgress || 0);
      const doorPassOpen = doorProgress > 0.55;
      const allowOutdoorAccess = true;
      const canPassDoorway = allowOutdoorAccess && doorPassOpen
        && Math.abs(nextPos.x) <= doorwayHalfWidth
        && nextPos.y - playerEyeHeight <= (roomStandY + doorwayHeight);

      if (nextPos.x > shellHalfX) {
        nextPos.x = shellHalfX;
        if (locParams.h1 === 'x') collisionH1 = true; else collisionH2 = true;
      } else if (nextPos.x < -shellHalfX) {
        nextPos.x = -shellHalfX;
        if (locParams.h1 === 'x') collisionH1 = true; else collisionH2 = true;
      }

      if (nextPos.z < -shellHalfZ) {
        nextPos.z = -shellHalfZ;
        if (locParams.h2 === 'z') collisionH2 = true; else collisionH1 = true;
      } else if (nextPos.z > shellHalfZ && !canPassDoorway) {
        nextPos.z = shellHalfZ;
        if (locParams.h2 === 'z') collisionH2 = true; else collisionH1 = true;
      }
    }
    
    let collisionX = (locParams.h1 === 'x' && collisionH1) || (locParams.h2 === 'x' && collisionH2);
    let collisionZ = (locParams.h1 === 'z' && collisionH1) || (locParams.h2 === 'z' && collisionH2);
    if (locParams.upAxis === 'x') collisionX = false;
    if (locParams.upAxis === 'z') collisionZ = false;

    const verticalAfterIntegration = state.velocity.dot(gravityUp);
    const risingFromJump = !isSwimming && verticalAfterIntegration > 0.12;
    const supportSnapSlack = useEarthWalkableSurface
      ? 0.75
      : ((cubeSurfaceState && state.currentCubeFace) ? 0.38 : 0.22);
    const radialSupportDistance = outdoorSupportState
      ? getSupportDistanceAlongNormal(nextPos, outdoorSupportState)
      : Number.POSITIVE_INFINITY;
    const canSnapRadially = !!(
      useEarthWalkableSurface
      && outdoorSupportState?.supportPoint
      && outdoorSupportState?.supportNormal
      && radialSupportDistance <= (playerEyeHeight + supportSnapSlack + 0.5)
    );
    if (!isSwimming && supportY > -Infinity && !risingFromJump && getLocalP(nextPos, 'up') <= supportY + playerEyeHeight + supportSnapSlack) {
      const groundTargetUp = supportY + playerEyeHeight;
      setLocalP(nextPos, 'up', groundTargetUp);
      state.canJump = true;
      state.lastGroundedAtMs = nowMs;
      tempGroundHorizontal.copy(state.velocity).projectOnPlane(gravityUp);
      if (!hasMovementInput && tempGroundHorizontal.lengthSq() < 0.04) {
        tempGroundHorizontal.set(0, 0, 0);
      }
      state.velocity.copy(tempGroundHorizontal);
    } else if (!isSwimming && canSnapRadially && !risingFromJump) {
      snapPositionToSupport(nextPos, outdoorSupportState, playerEyeHeight);
      state.canJump = true;
      state.lastGroundedAtMs = nowMs;
      tempGroundHorizontal.copy(state.velocity).projectOnPlane(gravityUp);
      if (!hasMovementInput && tempGroundHorizontal.lengthSq() < 0.04) {
        tempGroundHorizontal.set(0, 0, 0);
      }
      state.velocity.copy(tempGroundHorizontal);
    }

    if (collisionH1 || collisionH2) {
      if (!insideRoomVolume) {
        const verticalComponent = state.velocity.dot(gravityUp);
        const horizontalComponent = tempGroundHorizontal.copy(state.velocity).projectOnPlane(gravityUp);
        if (isSwimming) {
          horizontalComponent.multiplyScalar(0.58);
          state.velocity.copy(horizontalComponent).addScaledVector(gravityUp, verticalComponent * 0.85);
        } else {
          const axisH1 = locParams.h1;
          const axisH2 = locParams.h2;
          const h1Velocity = Number(horizontalComponent[axisH1] || 0);
          const h2Velocity = Number(horizontalComponent[axisH2] || 0);
          let nextH1 = h1Velocity;
          let nextH2 = h2Velocity;
          if (collisionX && collisionZ) {
            nextH1 *= 0.22;
            nextH2 *= 0.22;
          } else {
            if (collisionH1) nextH1 *= 0.14;
            if (collisionH2) nextH2 *= 0.14;
          }
          horizontalComponent[axisH1] = nextH1;
          horizontalComponent[axisH2] = nextH2;
          horizontalComponent[locParams.upAxis] = 0;
          state.velocity.copy(horizontalComponent).addScaledVector(gravityUp, verticalComponent);
        }
      } else {
        if (collisionX) state.velocity.x = 0;
        if (collisionZ) state.velocity.z = 0;
      }
      if (!Number.isFinite(state.velocity.x) || !Number.isFinite(state.velocity.y) || !Number.isFinite(state.velocity.z)) {
        state.velocity.set(0, 0, 0);
      }
    }

    playerPosition.copy(nextPos);
    if (!isFiniteVec3(playerPosition)) {
      playerPosition.copy(previousPlayerPosition);
      state.velocity.set(0, 0, 0);
      state.canJump = true;
      state.lastGroundedAtMs = nowMs;
    } else {
      state.lastValidPosition.copy(playerPosition);
    }
    const movedHorizontally = tempHorizontalTravel.copy(playerPosition)
      .sub(previousPlayerPosition)
      .projectOnPlane(gravityUp)
      .length();
    const normalizedWalk = targetSpeed > 0 ? clamp01(movedHorizontally / Math.max(targetSpeed * dt, 0.0001)) : 0;
    const walkTargetBlend = isSwimming
      ? (hasDirectionalInput ? Math.max(0.18, normalizedWalk) : normalizedWalk * 0.65)
      : (hasDirectionalInput ? Math.max(0.22, normalizedWalk) : normalizedWalk);
    state.localPlayerWalkBlend = dampScalar(state.localPlayerWalkBlend, walkTargetBlend, 18, dt);
    if (state.localPlayerWalkBlend > 0.001) {
      state.localPlayerWalkPhase += dt * (isSwimming ? (5 + (state.localPlayerWalkBlend * 6)) : (8 + (state.localPlayerWalkBlend * 10)));
    } else {
      state.localPlayerWalkPhase *= Math.max(0, 1 - (dt * 12));
    }

    const finalBlend = getPlanetBlend(playerPosition);
    const finalCubeSurfaceState = (activeCelestialBody === "earth" && typeof getCubeSurfaceState === "function")
      ? getCubeSurfaceState(playerPosition, state.currentCubeFace)
      : null;
    if (finalCubeSurfaceState?.face) {
      state.currentCubeFace = finalCubeSurfaceState.face;
    }
    const finalEarthSupportState = useEarthWalkableSurface
      ? cloneSupportState(getEarthSurfaceSupportStateAtPosition(playerPosition))
      : null;
    const finalSurfaceUp = insideRoomVolume
      ? gravityUp.clone()
      : (
        useEarthWalkableSurface
          ? (finalEarthSupportState?.supportNormal?.clone?.()
            || getEarthWalkableSurfaceNormal(playerPosition.x, playerPosition.z).clone()).normalize()
          : ((finalCubeSurfaceState?.up?.clone?.() || getPlanetSurfaceNormal(playerPosition, finalBlend).clone()).normalize())
      );
    transportSurfaceReferenceForward(state, finalSurfaceUp);
    const finalFrame = useEarthWalkableSurface
      ? {
        forward: getProjectedForward(THREE, finalSurfaceUp, state.surfaceReferenceForward)
      }
      : (
        finalCubeSurfaceState
          ? {
            forward: finalCubeSurfaceState.tangentForward?.clone?.() || getProjectedForward(THREE, finalSurfaceUp, state.surfaceReferenceForward)
          }
          : getPlanetFrame(playerPosition, state.playerYaw, finalBlend, state.surfaceReferenceForward)
      );
    state.surfaceReferenceForward.copy(
      getProjectedForward(THREE, finalSurfaceUp, finalFrame?.forward || state.surfaceReferenceForward)
    );
    state.surfaceReferenceUp.copy(finalSurfaceUp);
    state.debugSurfaceMode = insideRoomVolume
      ? "room"
      : (useEarthWalkableSurface ? "earth_radial" : "planet_voxel");
    state.debugCollisionFlags = {
      x: !!collisionX,
      z: !!collisionZ,
      ceiling: !!collisionCeiling
    };
    state.debugLastSupport = insideRoomVolume
      ? {
        kind: "room",
        supportY: Number.isFinite(supportY) ? Number(supportY) : null
      }
      : (
        useEarthWalkableSurface
          ? {
            kind: "earth_surface",
            supportY: Number.isFinite(finalEarthSupportState?.supportY) ? Number(finalEarthSupportState.supportY) : null,
            supportPoint: finalEarthSupportState?.supportPoint ? {
              x: Number(finalEarthSupportState.supportPoint.x || 0),
              y: Number(finalEarthSupportState.supportPoint.y || 0),
              z: Number(finalEarthSupportState.supportPoint.z || 0)
            } : null,
            supportNormal: finalEarthSupportState?.supportNormal ? {
              x: Number(finalEarthSupportState.supportNormal.x || 0),
              y: Number(finalEarthSupportState.supportNormal.y || 0),
              z: Number(finalEarthSupportState.supportNormal.z || 0)
            } : null,
            radialDistance: Number.isFinite(finalEarthSupportState?.radialDistance) ? Number(finalEarthSupportState.radialDistance) : null,
            clearance: Number.isFinite(finalEarthSupportState?.clearance) ? Number(finalEarthSupportState.clearance) : null
          }
          : {
            kind: "terrain_voxel",
            supportY: Number.isFinite(supportY) ? Number(supportY) : null
          }
      );

    return {
      insideRoomVolume,
      movedHorizontally,
      hasDirectionalInput,
      isSwimming
    };
  }

  return {
    step
  };
}
