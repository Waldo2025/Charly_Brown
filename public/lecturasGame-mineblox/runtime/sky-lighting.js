function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

export function createSkyLightingRuntime({ THREE }) {
  const LABEL_PIXEL_SCALE = 0.08;
  const SHADOW_REFRESH_POLICY = Object.freeze({
    low: {
      maxIntervalMs: Infinity,
      angularThresholdRad: Infinity,
      positionThreshold: Infinity,
      targetThreshold: Infinity
    },
    balanced: {
      maxIntervalMs: 220,
      angularThresholdRad: THREE.MathUtils.degToRad(0.32),
      positionThreshold: 0.42,
      targetThreshold: 0.28
    },
    high: {
      maxIntervalMs: 120,
      angularThresholdRad: THREE.MathUtils.degToRad(0.16),
      positionThreshold: 0.22,
      targetThreshold: 0.16
    }
  });
  const dynamicLightingState = {
    renderedSunPosition: new THREE.Vector3(),
    renderedMoonPosition: new THREE.Vector3(),
    renderedStarPosition: new THREE.Vector3(),
    renderedTargetPosition: new THREE.Vector3(),
    lastShadowPosition: new THREE.Vector3(),
    lastShadowTarget: new THREE.Vector3(),
    lastShadowDirection: new THREE.Vector3(),
    lightAngularDelta: 0,
    lightPositionDelta: 0,
    shadowRefreshCount: 0,
    lastShadowUpdateAt: 0,
    shadowRefreshApplied: false,
    currentTier: "balanced",
    forceSnap: true
  };

  function expSmoothAlpha(delta, lambda) {
    return 1 - Math.exp(-Math.max(0, Number(delta || 0)) * Math.max(0.01, Number(lambda || 1)));
  }

  function updateSmoothedVector(current, target, delta, lambda, snap = false, snapDistance = Infinity) {
    if (!current?.copy || !target?.clone) return 0;
    const distance = current.distanceTo(target);
    if (snap || !Number.isFinite(distance) || distance >= snapDistance) {
      current.copy(target);
      return distance;
    }
    current.lerp(target, expSmoothAlpha(delta, lambda));
    return distance;
  }

  function getShadowRefreshPolicy(performanceTier = "balanced") {
    return SHADOW_REFRESH_POLICY[performanceTier] || SHADOW_REFRESH_POLICY.balanced;
  }

  function resetDynamicLighting() {
    dynamicLightingState.forceSnap = true;
    dynamicLightingState.lightAngularDelta = 0;
    dynamicLightingState.lightPositionDelta = 0;
    dynamicLightingState.shadowRefreshApplied = false;
  }

  function getDynamicLightingDebugState() {
    return {
      shadowRefreshCount: Number(dynamicLightingState.shadowRefreshCount || 0),
      lastShadowUpdateAt: Number(dynamicLightingState.lastShadowUpdateAt || 0),
      lightAngularDelta: Number(dynamicLightingState.lightAngularDelta || 0),
      lightPositionDelta: Number(dynamicLightingState.lightPositionDelta || 0),
      currentTier: dynamicLightingState.currentTier || "balanced",
      shadowRefreshApplied: !!dynamicLightingState.shadowRefreshApplied
    };
  }

  function createFocusLabelSprite(text, scale = [3.6, 0.54, 1]) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 1024;
    canvas.height = 192;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "700 112px sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.92)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text || "").trim() || "Etiqueta", canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false
    }));
    sprite.center.set(0.5, 0);
    sprite.scale.set(scale[0], scale[1], scale[2] || 1);
    sprite.userData.baseLabelScale = sprite.scale.clone();
    sprite.userData.labelAspect = scale[0] / Math.max(0.0001, scale[1] || 1);
    sprite.material.opacity = 0;
    sprite.material.depthTest = true;
    sprite.visible = false;
    sprite.renderOrder = -838;
    return sprite;
  }

  function updateFocusLabels({ camera, focusLabels = [] }) {
    if (!camera || !Array.isArray(focusLabels) || !focusLabels.length) return;
    const cameraForward = new THREE.Vector3();
    const labelWorldPosition = new THREE.Vector3();
    const labelOffset = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    focusLabels.forEach((entry) => {
      const sprite = entry?.sprite;
      if (!sprite?.material) return;
      if (!sprite.userData.baseLabelScale) {
        sprite.userData.baseLabelScale = sprite.scale.clone();
        sprite.userData.labelAspect = sprite.scale.x / Math.max(0.0001, sprite.scale.y || 1);
      }
      const allowed = typeof entry.visibility === "function" ? !!entry.visibility() : true;
      if (!allowed) {
        sprite.material.opacity = 0;
        sprite.visible = false;
        return;
      }
      sprite.getWorldPosition(labelWorldPosition);
      const distanceToCamera = Math.max(0.01, camera.position.distanceTo(labelWorldPosition));
      const viewDirection = labelOffset.copy(labelWorldPosition).sub(camera.position);
      if (viewDirection.lengthSq() < 1e-4) {
        sprite.material.opacity = 0;
        sprite.visible = false;
        return;
      }
      const focusDot = cameraForward.dot(viewDirection.normalize());
      const threshold = Number.isFinite(entry.threshold) ? entry.threshold : 0.12;
      const fullOpacityDot = Number.isFinite(entry.fullOpacityDot)
        ? Math.max(threshold + 0.02, entry.fullOpacityDot)
        : 0.42;
      const focusStrength = clamp01((focusDot - threshold) / Math.max(0.0001, fullOpacityDot - threshold));
      const viewportHeight = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 1080);
      const targetPixelHeight = Number.isFinite(entry.targetPixelHeight)
        ? entry.targetPixelHeight
        : (entry.labelKind === "constellation" ? 104 : 84);
      const minPixelHeight = Number.isFinite(entry.minPixelHeight)
        ? entry.minPixelHeight
        : (entry.labelKind === "constellation" ? 80 : 64);
      const maxPixelHeight = Number.isFinite(entry.maxPixelHeight)
        ? entry.maxPixelHeight
        : (entry.labelKind === "constellation" ? 144 : 120);
      const clampedPixelHeight = Math.max(
        minPixelHeight * LABEL_PIXEL_SCALE,
        Math.min(maxPixelHeight * LABEL_PIXEL_SCALE, targetPixelHeight * LABEL_PIXEL_SCALE)
      );
      const verticalFov = THREE.MathUtils.degToRad(Math.max(20, Number(camera.fov || 60)));
      const targetWorldHeight = 2 * Math.tan(verticalFov * 0.5) * distanceToCamera * (clampedPixelHeight / viewportHeight);
      const labelAspect = Number.isFinite(sprite.userData.labelAspect) ? sprite.userData.labelAspect : 6;
      sprite.scale.set(
        targetWorldHeight * labelAspect,
        targetWorldHeight,
        sprite.userData.baseLabelScale.z || 1
      );
      sprite.material.opacity = focusStrength * 0.98;
      sprite.visible = sprite.material.opacity > 0.02;
    });
  }

  function applyBalancedLighting({
    sunLight = null,
    moonLight = null,
    starLight = null,
    ambientLight = null,
    hemisphereLight = null,
    activeBodyCenter = null,
    localSunDirection = null,
    localEclipseDim = 1,
    sunEnergyScale = 1,
    dayFactor = 0,
    twilightFactor = 0,
    nightFactor = 0,
    moonDirection = null,
    moonAltitude = -1,
    moonPhase = 0,
    moonVisible = false,
    inSpaceBody = false,
    getPlanetEyeRadius = () => 74,
    delta = 0,
    nowMs = 0,
    performanceTier = "balanced",
    forceShadowRefresh = false
  }) {
    dynamicLightingState.shadowRefreshApplied = false;
    const previousTier = dynamicLightingState.currentTier;
    const safeDelta = Math.max(0, Number(delta || 0));
    const forceSnap = dynamicLightingState.forceSnap || !!forceShadowRefresh;
    const desiredTargetPosition = activeBodyCenter?.clone?.() || null;
    const sunLightDistance = Math.max(180, getPlanetEyeRadius() * 4.6);
    if (desiredTargetPosition) {
      updateSmoothedVector(
        dynamicLightingState.renderedTargetPosition,
        desiredTargetPosition,
        safeDelta,
        18,
        forceSnap,
        22
      );
    }
    if (sunLight && activeBodyCenter && localSunDirection) {
      const desiredSunLightPos = activeBodyCenter.clone().add(localSunDirection.clone().multiplyScalar(sunLightDistance));
      updateSmoothedVector(
        dynamicLightingState.renderedSunPosition,
        desiredSunLightPos,
        safeDelta,
        16,
        forceSnap,
        28
      );
      sunLight.position.copy(dynamicLightingState.renderedSunPosition);
      if (desiredTargetPosition) {
        sunLight.target.position.copy(dynamicLightingState.renderedTargetPosition);
      }
      sunLight.intensity = (0.22 + dayFactor * 1.18 + twilightFactor * 0.18) * localEclipseDim * sunEnergyScale;
      sunLight.color.setHSL(0.12, 0.09, dayFactor > 0.42 ? 0.92 : 0.84);
    }
    if (moonLight) {
      const moonFactor = clamp01((Number(moonAltitude || -1) + 0.08) / 0.48);
      const moonNightBlend = clamp01((nightFactor - 0.06) / 0.8) + (twilightFactor * 0.08);
      const moonIntensity = moonVisible && activeBodyCenter && moonDirection?.clone
        ? moonFactor * moonNightBlend * (0.06 + (clamp01(moonPhase) * 0.16)) * Math.max(0, 1 - (dayFactor * 0.9))
        : 0;
      if (moonIntensity > 0.0005 && activeBodyCenter && moonDirection?.clone) {
        const desiredMoonLightPos = activeBodyCenter.clone().add(moonDirection.clone().normalize().multiplyScalar(sunLightDistance * 0.9));
        updateSmoothedVector(
          dynamicLightingState.renderedMoonPosition,
          desiredMoonLightPos,
          safeDelta,
          14,
          forceSnap,
          24
        );
        moonLight.position.copy(dynamicLightingState.renderedMoonPosition);
        if (desiredTargetPosition) {
          moonLight.target.position.copy(dynamicLightingState.renderedTargetPosition);
        }
      }
      moonLight.intensity = moonIntensity;
      moonLight.color.setHSL(0.58, 0.14, 0.82);
      // Moon shadows create a large circular artifact around the avatar on the curved terrain.
      // Keep lunar fill light, but leave shadow casting disabled.
      moonLight.castShadow = false;
      if (moonLight.shadow) {
        moonLight.shadow.autoUpdate = false;
      }
    }
    if (starLight) {
      const starNightBlend = clamp01((nightFactor - 0.08) / 0.88);
      const starIntensity = inSpaceBody ? 0.04 : (0.012 + (starNightBlend * 0.085)) * Math.max(0.18, localEclipseDim);
      if (activeBodyCenter && localSunDirection) {
        const starDirection = localSunDirection.clone().multiplyScalar(-0.35).add(new THREE.Vector3(0.22, 0.94, -0.18)).normalize();
        const desiredStarLightPos = activeBodyCenter.clone().add(starDirection.multiplyScalar(sunLightDistance * 0.95));
        updateSmoothedVector(
          dynamicLightingState.renderedStarPosition,
          desiredStarLightPos,
          safeDelta,
          10,
          forceSnap,
          28
        );
        starLight.position.copy(dynamicLightingState.renderedStarPosition);
        if (desiredTargetPosition) {
          starLight.target.position.copy(dynamicLightingState.renderedTargetPosition);
        }
      }
      starLight.intensity = starIntensity;
      starLight.color.setHSL(0.62, 0.22, 0.84);
      starLight.castShadow = false;
      if (starLight.shadow) {
        starLight.shadow.autoUpdate = false;
      }
    }
    if (ambientLight) {
      const ambientIntensity = inSpaceBody
        ? 0.035
        : (0.06 + (dayFactor * 0.22) + (twilightFactor * 0.05) + (nightFactor * 0.02)) * Math.max(0.35, localEclipseDim);
      ambientLight.intensity = ambientIntensity;
      ambientLight.color.setHSL(0.57, 0.16, inSpaceBody ? 0.62 : (0.68 - (twilightFactor * 0.08)));
    }
    if (hemisphereLight) {
      const hemisphereIntensity = inSpaceBody
        ? 0.025
        : (0.08 + (dayFactor * 0.26) + (twilightFactor * 0.08) + (nightFactor * 0.04)) * Math.max(0.3, localEclipseDim);
      hemisphereLight.intensity = hemisphereIntensity;
      hemisphereLight.color.setHSL(0.56, 0.24, dayFactor > 0.52 ? 0.72 : 0.64);
      hemisphereLight.groundColor.setHSL(0.08, 0.22, 0.17 + (nightFactor * 0.04));
    }

    if (sunLight?.shadow && sunLight.castShadow && desiredTargetPosition) {
      const policy = getShadowRefreshPolicy(performanceTier);
      const currentShadowDirection = dynamicLightingState.renderedSunPosition
        .clone()
        .sub(dynamicLightingState.renderedTargetPosition)
        .normalize();
      const hasLastShadowDirection = dynamicLightingState.lastShadowDirection.lengthSq() > 1e-6;
      const elapsedMs = Math.max(0, Number(nowMs || 0) - Number(dynamicLightingState.lastShadowUpdateAt || 0));
      dynamicLightingState.lightAngularDelta = hasLastShadowDirection
        ? dynamicLightingState.lastShadowDirection.angleTo(currentShadowDirection)
        : Math.PI;
      dynamicLightingState.lightPositionDelta = dynamicLightingState.lastShadowPosition.distanceTo(dynamicLightingState.renderedSunPosition);
      const targetDelta = dynamicLightingState.lastShadowTarget.distanceTo(dynamicLightingState.renderedTargetPosition);
      const tierChanged = previousTier !== performanceTier;
      const shouldRefreshShadow = !!forceShadowRefresh
        || !hasLastShadowDirection
        || tierChanged
        || dynamicLightingState.lightAngularDelta >= policy.angularThresholdRad
        || dynamicLightingState.lightPositionDelta >= policy.positionThreshold
        || targetDelta >= policy.targetThreshold
        || elapsedMs >= policy.maxIntervalMs;
      sunLight.shadow.autoUpdate = false;
      if (shouldRefreshShadow) {
        sunLight.shadow.needsUpdate = true;
        dynamicLightingState.lastShadowDirection.copy(currentShadowDirection);
        dynamicLightingState.lastShadowPosition.copy(dynamicLightingState.renderedSunPosition);
        dynamicLightingState.lastShadowTarget.copy(dynamicLightingState.renderedTargetPosition);
        dynamicLightingState.lastShadowUpdateAt = Number(nowMs || 0);
        dynamicLightingState.shadowRefreshCount += 1;
        dynamicLightingState.shadowRefreshApplied = true;
      }
    } else if (sunLight?.shadow) {
      sunLight.shadow.autoUpdate = false;
    }

    dynamicLightingState.currentTier = performanceTier;
    dynamicLightingState.forceSnap = false;
    return getDynamicLightingDebugState();
  }

  return {
    createFocusLabelSprite,
    updateFocusLabels,
    applyBalancedLighting,
    getDynamicLightingDebugState,
    resetDynamicLighting
  };
}
