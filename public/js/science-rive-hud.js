(function installScienceRiveHud(global) {
  "use strict";

  var instances = new WeakMap();
  var mountedHosts = new Set();
  var cleanupObserver;

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resolveUrl(configured, fallback) {
    try {
      return new URL(configured || fallback, global.location.href).href;
    } catch {
      return configured || fallback;
    }
  }

  function destroy(host) {
    var mounted = instances.get(host);
    if (!mounted) return;
    mounted.resizeObserver && mounted.resizeObserver.disconnect();
    mounted.interactionRoot && mounted.interactionRoot.removeEventListener("pointerdown", mounted.handlePointerDown);
    mounted.interactionRoot && mounted.interactionRoot.removeEventListener("keydown", mounted.handleKeyDown);
    mounted.rive && mounted.rive.cleanup();
    instances.delete(host);
    mountedHosts.delete(host);
    host.classList.remove("is-rive-ready", "is-rive-pulsing");
    host.classList.add("is-rive-stopped");
  }

  function ensureCleanupObserver() {
    if (cleanupObserver || !global.MutationObserver) return;
    cleanupObserver = new MutationObserver(function () {
      mountedHosts.forEach(function (host) {
        if (!host.isConnected) destroy(host);
      });
    });
    cleanupObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function pulseAction(host, riveInstance) {
    host.classList.remove("is-rive-pulsing");
    void host.offsetWidth;
    host.classList.add("is-rive-pulsing");
    if (!prefersReducedMotion()) {
      riveInstance.stop();
      riveInstance.play();
    }
    global.setTimeout(function () { host.classList.remove("is-rive-pulsing"); }, 520);
  }

  function riveFit(runtime, value) {
    return {
      contain: runtime.Fit.Contain,
      cover: runtime.Fit.Cover,
      fill: runtime.Fit.Fill,
      fitwidth: runtime.Fit.FitWidth,
      fitheight: runtime.Fit.FitHeight
    }[String(value || "").toLowerCase()] || runtime.Fit.Cover;
  }

  function activateStateMachine(host, riveInstance, stateMachine) {
    if (!stateMachine || !riveInstance?.stateMachineInputs) return false;
    var inputs = riveInstance.stateMachineInputs(stateMachine) || [];
    var preferredInput = inputs.find(function (input) {
      return /^(offon|on|active|open|enabled|play)$/i.test(String(input.name || "").replace(/[\s_-]/g, ""));
    }) || inputs.find(function (input) {
      return /on|active|open|enable|play/i.test(String(input.name || ""));
    }) || inputs[0];
    if (!preferredInput) return false;

    try {
      if (typeof preferredInput.fire === "function") {
        preferredInput.fire();
      } else if ("value" in preferredInput) {
        preferredInput.value = true;
      } else {
        return false;
      }
      host.dataset.riveActivatedInput = preferredInput.name || "input";
      return true;
    } catch (error) {
      console.warn("[ScienceRiveHud] No fue posible activar la máquina de estados:", error);
      return false;
    }
  }

  function mount(host, options) {
    options = options || {};
    if (!host || instances.has(host)) return instances.get(host) || null;
    var runtime = global.rive;
    if (!runtime || !runtime.Rive || !runtime.RuntimeLoader) {
      host.classList.add("is-rive-unavailable");
      return null;
    }

    var canvas = host.querySelector("canvas") || host.appendChild(document.createElement("canvas"));
    canvas.setAttribute("aria-hidden", "true");
    canvas.tabIndex = -1;
    var interactionRoot = options.interactionRoot || host.closest(".science-micro-mission");
    var resizeObserver;
    var isStaticSurface = host.hasAttribute("data-rive-static");
    var animation = host.dataset.riveAnimation || global.SCIENCE_RIVE_ANIMATION || "";
    var stateMachine = host.dataset.riveStateMachine || global.SCIENCE_RIVE_STATE_MACHINE || "State Machine 1";
    var shouldAutoplay = !prefersReducedMotion();

    runtime.RuntimeLoader.setWasmUrl(resolveUrl(global.SCIENCE_RIVE_WASM_URL, "../vendor/rive/rive.wasm"));
    var riveOptions = {
      src: resolveUrl(global.SCIENCE_RIVE_HUD_URL, "../assets/rive/science-tech-hud.riv?v=20260730-rive-reticle-v2"),
      canvas: canvas,
      artboard: host.dataset.riveArtboard || global.SCIENCE_RIVE_ARTBOARD || "New Artboard",
      autoplay: shouldAutoplay,
      shouldDisableRiveListeners: true,
      isTouchScrollEnabled: true,
      layout: new runtime.Layout({ fit: riveFit(runtime, host.dataset.riveFit), alignment: runtime.Alignment.Center }),
      onLoad: function () {
        riveInstance.resizeDrawingSurfaceToCanvas(Math.min(global.devicePixelRatio || 1, 2));
        host.dataset.riveAnimations = riveInstance.animationNames.join(",");
        host.dataset.riveStateMachines = riveInstance.stateMachineNames.join(",");
        if (stateMachine) {
          var stateInputs = riveInstance.stateMachineInputs(stateMachine) || [];
          host.dataset.riveInputs = stateInputs.map(function (input) {
            return input.name + ":" + input.type;
          }).join(",");
          activateStateMachine(host, riveInstance, stateMachine);
        }
        if (animation) host.dataset.riveActiveAnimation = animation;
        if (stateMachine) host.dataset.riveActiveStateMachine = stateMachine;
        if (!shouldAutoplay) {
          riveInstance.drawFrame();
        } else if (isStaticSurface) {
          global.setTimeout(function () {
            if (!instances.has(host)) return;
            riveInstance.pause(stateMachine || animation);
            host.classList.add("is-rive-settled");
          }, 1100);
        }
        host.classList.add("is-rive-ready");
        host.parentElement?.classList.add("has-rive-surface");
        host.__scienceMissionAnnounce?.();
      },
      onLoadError: function (error) {
        host.classList.add("is-rive-unavailable");
        console.warn("[ScienceRiveHud] No fue posible cargar el HUD:", error);
      }
    };
    if (stateMachine) riveOptions.stateMachines = stateMachine;
    else if (animation) riveOptions.animations = animation;
    var riveInstance = new runtime.Rive(riveOptions);

    function resize() {
      riveInstance.resizeDrawingSurfaceToCanvas(Math.min(global.devicePixelRatio || 1, 2));
    }
    if (global.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    }

    function handlePointerDown(event) {
      if (event.target.closest("button,[role='button']")) pulseAction(host, riveInstance);
    }
    function handleKeyDown(event) {
      if ((event.key === "Enter" || event.key === " ") && event.target.closest("button,[role='button']")) pulseAction(host, riveInstance);
    }
    interactionRoot && interactionRoot.addEventListener("pointerdown", handlePointerDown);
    interactionRoot && interactionRoot.addEventListener("keydown", handleKeyDown);

    var mounted = { rive: riveInstance, resizeObserver: resizeObserver, interactionRoot: interactionRoot, handlePointerDown: handlePointerDown, handleKeyDown: handleKeyDown };
    instances.set(host, mounted);
    mountedHosts.add(host);
    ensureCleanupObserver();
    return mounted;
  }

  function mountAll(root) {
    (root || document).querySelectorAll("[data-science-rive-hud]").forEach(function (host) {
      mount(host, {
        interactionRoot: host.closest(".science-micro-mission"),
        level: Number(host.dataset.riveLevel || 1),
        progress: Number(host.dataset.riveProgress || 0)
      });
    });
  }

  function destroyAll(root) {
    (root || document).querySelectorAll("[data-science-rive-hud]").forEach(destroy);
  }

  function setAnimation(host, animation, autoplay) {
    var mounted = instances.get(host);
    if (!mounted?.rive || !animation) return false;
    mounted.rive.reset({ animations: animation, autoplay: autoplay !== false && !prefersReducedMotion() });
    host.dataset.riveActiveAnimation = animation;
    if (autoplay === false || prefersReducedMotion()) mounted.rive.drawFrame();
    return true;
  }

  function setState(host, state) {
    host.dataset.riveState = state;
    var mounted = instances.get(host);
    if (!mounted?.rive) return false;
    var stateMachine = host.dataset.riveStateMachine || global.SCIENCE_RIVE_STATE_MACHINE || "State Machine 1";
    mounted.rive.reset({ stateMachines: stateMachine, autoplay: state !== "idle" && !prefersReducedMotion() });
    activateStateMachine(host, mounted.rive, stateMachine);
    if (state === "idle" || prefersReducedMotion()) mounted.rive.drawFrame();
    return true;
  }

  function stateInput(host, inputName) {
    var mounted = instances.get(host);
    if (!mounted?.rive || !inputName) return null;
    var stateMachine = host.dataset.riveStateMachine || global.SCIENCE_RIVE_STATE_MACHINE || "State Machine 1";
    return (mounted.rive.stateMachineInputs(stateMachine) || []).find(function (input) {
      return String(input.name || "").toLowerCase() === String(inputName).toLowerCase();
    }) || null;
  }

  function setInput(host, inputName, value) {
    var input = stateInput(host, inputName);
    if (!input || !("value" in input)) return false;
    input.value = value;
    return true;
  }

  function fireTrigger(host, inputName) {
    var input = stateInput(host, inputName);
    if (!input || typeof input.fire !== "function") return false;
    input.fire();
    return true;
  }

  function setTextRuns(host, values) {
    var mounted = instances.get(host);
    if (!mounted?.rive || host.dataset.riveArtboard !== "MissionCarousel" || !values || typeof values !== "object") return false;
    var supported = true;
    Object.entries(values).forEach(function ([name, value]) {
      if (typeof mounted.rive.getTextRunValue !== "function" || mounted.rive.getTextRunValue(name) === undefined) {
        supported = false;
        return;
      }
      mounted.rive.setTextRunValue(name, String(value ?? ""));
    });
    return supported;
  }

  function configureMissionCarousel(host, pages) {
    if (!host || !Array.isArray(pages) || !pages.length) return false;
    var normalizedPages = pages.map(function (page, index) {
      return { label: String(page?.label || "MISIÓN"), title: String(page?.title || ""), body: String(page?.body || ""), step: index + 1 };
    });
    var fallback = host.querySelector("[data-rive-carousel-fallback]");
    var previousButton = host.querySelector("[data-rive-carousel-prev]");
    var nextButton = host.querySelector("[data-rive-carousel-next]");
    var active = 0;
    var pointerStart = null;
    var announce = function () {
      var page = normalizedPages[active];
      var values = { StepLabel: "0" + page.step + " · " + page.label, StepTitle: page.title, StepBody: page.body, StepCount: page.step + "/" + normalizedPages.length };
      fallback?.querySelector("[data-rive-carousel-label]") && (fallback.querySelector("[data-rive-carousel-label]").textContent = values.StepLabel);
      fallback?.querySelector("[data-rive-carousel-title]") && (fallback.querySelector("[data-rive-carousel-title]").textContent = values.StepTitle);
      fallback?.querySelector("[data-rive-carousel-body]") && (fallback.querySelector("[data-rive-carousel-body]").textContent = values.StepBody);
      fallback?.querySelector("[data-rive-carousel-count]") && (fallback.querySelector("[data-rive-carousel-count]").textContent = values.StepCount);
      host.classList.toggle("is-rive-mission-rendered", setTextRuns(host, values));
      host.dataset.rivePage = String(active);
      setInput(host, "page", active);
      host.querySelectorAll("[data-rive-carousel-dot]").forEach(function (dot, index) { dot.classList.toggle("is-active", index === active); dot.setAttribute("aria-current", index === active ? "step" : "false"); });
      if (previousButton) previousButton.disabled = active === 0;
      if (nextButton) nextButton.disabled = active === normalizedPages.length - 1;
    };
    var change = function (direction) {
      var next = Math.max(0, Math.min(normalizedPages.length - 1, active + direction));
      if (next === active) return;
      active = next;
      fireTrigger(host, direction > 0 ? "next" : "previous");
      announce();
    };
    host.__scienceMissionAnnounce = announce;
    host.tabIndex = 0;
    host.addEventListener("keydown", function (event) { if (event.key === "ArrowRight") { event.preventDefault(); change(1); } if (event.key === "ArrowLeft") { event.preventDefault(); change(-1); } });
    host.addEventListener("pointerdown", function (event) { if (event.target.closest("button")) return; pointerStart = { x: event.clientX, y: event.clientY }; host.setPointerCapture?.(event.pointerId); });
    host.addEventListener("pointerup", function (event) { if (!pointerStart) return; var dx = event.clientX - pointerStart.x; var dy = event.clientY - pointerStart.y; pointerStart = null; if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy)) change(dx < 0 ? 1 : -1); });
    host.addEventListener("pointercancel", function () { pointerStart = null; });
    previousButton?.addEventListener("click", function () { change(-1); });
    nextButton?.addEventListener("click", function () { change(1); });
    host.querySelectorAll("[data-rive-carousel-dot]").forEach(function (dot, index) { dot.addEventListener("click", function () { var direction = index > active ? 1 : -1; active = index; fireTrigger(host, direction > 0 ? "next" : "previous"); announce(); }); });
    announce();
    global.setTimeout(announce, 100);
    return true;
  }

  global.ScienceRiveHud = {
    mount: mount,
    mountAll: mountAll,
    destroy: destroy,
    destroyAll: destroyAll,
    setAnimation: setAnimation,
    setState: setState,
    setInput: setInput,
    fireTrigger: fireTrigger,
    setTextRuns: setTextRuns,
    configureMissionCarousel: configureMissionCarousel
  };
}(window));
