export function createMovementInputController({ state, emitState, normalizeControlCode, isEditableTarget }) {
  function hasDirectionalMovementInput() {
    return !!(
      state.inputState.forward
      || state.inputState.backward
      || state.inputState.left
      || state.inputState.right
    );
  }

  function syncDirectionalInputFromPressedKeys() {
    const rawForward = state.pressedKeys.has("ArrowUp") || state.pressedKeys.has("KeyW");
    const rawLeft = state.pressedKeys.has("ArrowLeft") || state.pressedKeys.has("KeyA");
    const rawBackward = state.pressedKeys.has("ArrowDown") || state.pressedKeys.has("KeyS");
    const rawRight = state.pressedKeys.has("ArrowRight") || state.pressedKeys.has("KeyD");
    let forward = rawForward;
    let backward = rawBackward;
    let left = rawLeft;
    let right = rawRight;

    if (rawForward && rawBackward) {
      if (state.lastVerticalKey === "forward") {
        backward = false;
      } else if (state.lastVerticalKey === "backward") {
        forward = false;
      } else {
        backward = false;
      }
    }
    if (rawLeft && rawRight) {
      if (state.lastHorizontalKey === "left") {
        right = false;
      } else if (state.lastHorizontalKey === "right") {
        left = false;
      } else {
        right = false;
      }
    }

    const sprint = state.pressedKeys.has("ShiftLeft") || state.pressedKeys.has("ShiftRight");
    state.moveForward = !!forward;
    state.moveLeft = !!left;
    state.moveBackward = !!backward;
    state.moveRight = !!right;
    state.inputState.forward = forward ? 1 : 0;
    state.inputState.left = left ? 1 : 0;
    state.inputState.backward = backward ? 1 : 0;
    state.inputState.right = right ? 1 : 0;
    state.inputState.sprint = !!sprint;
  }

  function handleTouchLookPointerDown(event, canvas, ensureAudioContext) {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return false;
    if (state.lookInputState.pointerId !== null) return false;
    event.preventDefault();
    ensureAudioContext?.()?.resume?.().catch(() => {});
    state.lookInputState.pointerId = event.pointerId;
    state.lookInputState.lastX = event.clientX;
    state.lookInputState.lastY = event.clientY;
    state.lookInputState.deltaX = 0;
    state.lookInputState.deltaY = 0;
    state._touchTravel = 0;
    if (canvas?.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (_) {}
    }
    return true;
  }

  function releaseTouchLook(pointerId, canvas) {
    if (state.lookInputState.pointerId !== pointerId) return;
    if (canvas?.hasPointerCapture?.(pointerId)) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch (_) {}
    }
    state.lookInputState.pointerId = null;
    state.lookInputState.lastX = 0;
    state.lookInputState.lastY = 0;
    state._touchTravel = 0;
  }

  function bindControls(bindings = {}) {
    const canvas = bindings.canvas || null;
    const doc = bindings.document || (typeof document !== "undefined" ? document : null);
    const win = bindings.window || (typeof window !== "undefined" ? window : null);
    const ensureAudioContext = bindings.ensureAudioContext || (() => null);
    const toggleSeatedStateFromCrosshair = bindings.onToggleSeatedStateFromCrosshair || (() => {});
    const togglePlayerViewMode = bindings.onTogglePlayerViewMode || (() => {});
    const resetAll = bindings.resetAll || (() => {});

    if (canvas) {
      canvas.style.touchAction = "none";
      if (typeof canvas.tabIndex !== "number" || canvas.tabIndex < 0) {
        canvas.tabIndex = 0;
      }
    }
    if (!canvas || !doc || !win || state._controlsBound) {
      return;
    }
    state._controlsBound = true;

    const handledKeys = new Set([
      "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
      "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyV",
      "ShiftLeft", "ShiftRight", "Space"
    ]);

    const onKeyDown = (event) => {
      const code = normalizeControlCode(event);
      if (!code || !handledKeys.has(code)) return;
      if (isEditableTarget(event.target) || isEditableTarget(doc.activeElement)) return;
      event.preventDefault();
      ensureAudioContext()?.resume?.().catch(() => {});
      if (event.repeat) return;
      state.pressedKeys.add(code);
      if (code === "ArrowUp" || code === "KeyW") state.lastVerticalKey = "forward";
      if (code === "ArrowDown" || code === "KeyS") state.lastVerticalKey = "backward";
      if (code === "ArrowLeft" || code === "KeyA") state.lastHorizontalKey = "left";
      if (code === "ArrowRight" || code === "KeyD") state.lastHorizontalKey = "right";
      if (code === "ShiftLeft" || code === "ShiftRight") {
        state.inputState.sprint = true;
      } else if (code === "KeyE") {
        toggleSeatedStateFromCrosshair();
      } else if (code === "KeyV") {
        togglePlayerViewMode();
      } else if (code === "Space") {
        state.jumpQueued = true;
        state.jumpQueuedAtMs = Date.now();
        state.inputState.jump = true;
      }
      syncDirectionalInputFromPressedKeys();
      emitState();
    };

    const onKeyUp = (event) => {
      const code = normalizeControlCode(event);
      if (!code || !handledKeys.has(code)) return;
      if (isEditableTarget(event.target) || isEditableTarget(doc.activeElement)) return;
      event.preventDefault();
      state.pressedKeys.delete(code);
      if ((code === "ArrowUp" || code === "KeyW") && state.lastVerticalKey === "forward") {
        state.lastVerticalKey = state.pressedKeys.has("ArrowDown") || state.pressedKeys.has("KeyS") ? "backward" : "";
      } else if ((code === "ArrowDown" || code === "KeyS") && state.lastVerticalKey === "backward") {
        state.lastVerticalKey = state.pressedKeys.has("ArrowUp") || state.pressedKeys.has("KeyW") ? "forward" : "";
      }
      if ((code === "ArrowLeft" || code === "KeyA") && state.lastHorizontalKey === "left") {
        state.lastHorizontalKey = state.pressedKeys.has("ArrowRight") || state.pressedKeys.has("KeyD") ? "right" : "";
      } else if ((code === "ArrowRight" || code === "KeyD") && state.lastHorizontalKey === "right") {
        state.lastHorizontalKey = state.pressedKeys.has("ArrowLeft") || state.pressedKeys.has("KeyA") ? "left" : "";
      }
      if (code === "ShiftLeft" || code === "ShiftRight") {
        state.inputState.sprint = false;
      } else if (code === "Space") {
        state.inputState.jump = false;
      }
      syncDirectionalInputFromPressedKeys();
      emitState();
    };

    const onBlur = () => resetAll();
    const onVisibility = () => {
      if (doc.hidden) resetAll();
    };

    const lockHandler = () => {
      if (doc.pointerLockElement !== canvas) {
        try {
          const maybePromise = canvas.requestPointerLock();
          if (maybePromise && typeof maybePromise.catch === "function") {
            maybePromise.catch(() => {});
          }
        } catch (_) {}
      }
    };

    const onPointerDown = (event) => {
      if (event.pointerType === "mouse" && event.button === 0) {
        try {
          canvas.focus({ preventScroll: true });
        } catch (_) {
          try { canvas.focus(); } catch (_) {}
        }
        ensureAudioContext()?.resume?.().catch(() => {});
        lockHandler();
        return;
      }
      if (handleTouchLookPointerDown(event, canvas, ensureAudioContext)) {
        return;
      }
    };

    const onMouseMove = (event) => {
      if (doc.pointerLockElement === canvas) {
        state.lookInputState.deltaX -= event.movementX;
        state.lookInputState.deltaY += event.movementY;
      }
    };

    const onPointerMove = (event) => {
      if (event.pointerId !== state.lookInputState.pointerId) return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      event.preventDefault();
      state._touchTravel += Math.hypot(event.clientX - state.lookInputState.lastX, event.clientY - state.lookInputState.lastY);
      state.lookInputState.deltaX += event.clientX - state.lookInputState.lastX;
      state.lookInputState.deltaY += event.clientY - state.lookInputState.lastY;
      state.lookInputState.lastX = event.clientX;
      state.lookInputState.lastY = event.clientY;
    };

    const onPointerUp = (event) => {
      const shouldInteract = event.pointerId === state.lookInputState.pointerId && (state._touchTravel || 0) <= 12;
      releaseTouchLook(event.pointerId, canvas);
      if (shouldInteract) {
        bindings.onTapInteraction?.();
      }
    };

    const onPointerCancel = (event) => releaseTouchLook(event.pointerId, canvas);
    const onPointerLockChange = () => {
      if (doc.pointerLockElement === canvas) return;
      state.lookInputState.deltaX = 0;
      state.lookInputState.deltaY = 0;
      state.lookTargetYaw = state.playerYaw;
      state.lookTargetPitch = state.playerPitch;
      emitState();
    };

    doc.addEventListener("keydown", onKeyDown);
    doc.addEventListener("keyup", onKeyUp);
    win.addEventListener("blur", onBlur);
    doc.addEventListener("visibilitychange", onVisibility);
    doc.addEventListener("pointerlockchange", onPointerLockChange);
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerCancel, { passive: false });
    doc.addEventListener("mousemove", onMouseMove);

    state._unbindControls = () => {
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
      win.removeEventListener("blur", onBlur);
      doc.removeEventListener("visibilitychange", onVisibility);
      doc.removeEventListener("pointerlockchange", onPointerLockChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      doc.removeEventListener("mousemove", onMouseMove);
      state._controlsBound = false;
    };

    if (bindings.setCameraRotationOrder) {
      bindings.setCameraRotationOrder("YXZ");
    }

    emitState();
  }

  return {
    bindControls,
    hasDirectionalMovementInput,
    syncDirectionalInputFromPressedKeys
  };
}
