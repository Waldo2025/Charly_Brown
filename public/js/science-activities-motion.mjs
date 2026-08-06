import {
  animate,
  createTimeline,
  remove as removeAnimation,
  set,
  stagger,
} from "../vendor/animejs/anime.esm.min.js";

const installedRoots = new WeakMap();
const animatedCards = new WeakSet();
const animatedHudPanels = new WeakSet();
const animatedStructuredGames = new WeakSet();
const animatedSimulators = new WeakSet();

const MOTION_TARGETS = [
  ".sa-question-card",
  ".science-micro-mission",
  ".sa-question-context",
  ".science-structured-game",
  ".sa-simulator-shell",
].join(",");

const INTERACTIVE_TARGETS = [
  ".sa-answer-options button",
  ".science-answer-options button",
  ".sa-assessment-form button",
  ".sa-start-level",
  ".science-start-level",
  ".sa-result-actions button",
  ".science-result-actions button",
  ".science-token-bank button",
  ".science-sequence-bank button",
  ".science-equation-slots button",
  ".science-action",
  ".sa-scene-check",
].join(",");

function motionIsReduced() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function motionDuration(value) {
  const compact = window.matchMedia?.("(max-width: 640px)")?.matches === true;
  return compact ? Math.round(value * .82) : value;
}

function addSproutSequence(timeline, targets, {
  start = 70,
  total = 1500,
  duration = 430,
  distance = 16,
} = {}) {
  const elements = [...targets].filter((target) => target instanceof Element);
  if (!elements.length) return timeline;
  const itemDuration = motionDuration(duration);
  const staggerWindow = Math.max(0, total - itemDuration);
  const itemDelay = elements.length > 1 ? staggerWindow / (elements.length - 1) : 0;
  set(elements, {
    opacity: 0,
    y: distance,
    scale: .965,
  });
  return timeline.add(elements, {
    opacity: [0, 1],
    y: [distance, 0],
    scale: [.965, 1],
    delay: stagger(itemDelay, { from: "first" }),
    duration: itemDuration,
    ease: "out(4)",
  }, start);
}

function questionCardSproutElements(card) {
  const elements = [];
  [...card.children].forEach((child) => {
    if (child.matches(".sa-question-context")) {
      elements.push(child);
      const header = child.querySelector(".sa-question-context-header") || child.querySelector(":scope > small");
      const copy = child.querySelector(".sa-question-context-copy") || child.querySelector(":scope > p");
      const data = [
        ...child.querySelectorAll(".sa-question-context-data span"),
        ...child.querySelectorAll(":scope > div:not([class]) span"),
      ];
      const goal = child.querySelector(".sa-question-context-goal") || child.querySelector(":scope > strong");
      elements.push(...[header, copy, ...data, goal].filter(Boolean));
      return;
    }
    if (child.matches(".sa-answer-options")) {
      elements.push(...child.querySelectorAll(":scope > button"));
      return;
    }
    elements.push(child);
  });
  return elements;
}

function elementsWithin(scope, selector) {
  if (!(scope instanceof Element)) return [];
  const matches = scope.matches(selector) ? [scope] : [];
  return [...matches, ...scope.querySelectorAll(selector)];
}

function addHudSweep(panel) {
  if (panel.querySelector(":scope > .sa-anime-hud-sweep")) return;
  const sweep = document.createElement("i");
  sweep.className = "sa-anime-hud-sweep";
  sweep.setAttribute("aria-hidden", "true");
  panel.prepend(sweep);
  animate(sweep, {
    x: ["-140%", "920%"],
    opacity: [0, .78, 0],
    duration: motionDuration(1120),
    delay: 160,
    ease: "inOut(3)",
    onComplete: () => sweep.remove(),
  });
}

function animateQuestionHud(panel) {
  if (animatedHudPanels.has(panel) || motionIsReduced()) return;
  animatedHudPanels.add(panel);
  const parentCard = panel.closest(".sa-question-card");
  if (parentCard && animatedCards.has(parentCard)) return;
  addHudSweep(panel);

  const header = panel.querySelector(".sa-question-context-header") || panel.querySelector(":scope > small");
  const copy = panel.querySelector(".sa-question-context-copy") || panel.querySelector(":scope > p");
  const data = [
    ...panel.querySelectorAll(".sa-question-context-data span"),
    ...panel.querySelectorAll(":scope > div:not([class]) span"),
  ];
  const goal = panel.querySelector(".sa-question-context-goal") || panel.querySelector(":scope > strong");
  const orderedElements = [header, copy, ...data, goal].filter(Boolean);

  const timeline = createTimeline({
    defaults: { ease: "out(4)" },
  });
  timeline
    .add(panel, {
      x: [-8, 0],
      scale: [.992, 1],
      duration: motionDuration(380),
    }, 0);
  addSproutSequence(timeline, orderedElements, {
    start: 100,
    total: 2380,
    duration: 540,
    distance: 20,
  });
}

function animateStandardQuestionCard(card) {
  if (animatedCards.has(card) || motionIsReduced()) return;
  animatedCards.add(card);
  const orderedElements = questionCardSproutElements(card);
  const timeline = createTimeline({
    defaults: { ease: "out(4)" },
  });
  timeline
    .add(card, {
      scale: [.992, 1],
      duration: motionDuration(380),
    }, 0);
  addSproutSequence(timeline, orderedElements, {
    start: 90,
    total: 2480,
    duration: 560,
    distance: 24,
  });
}

function animateLevelBriefing(card) {
  if (animatedCards.has(card) || motionIsReduced()) return;
  animatedCards.add(card);
  const isMicroMission = card.classList.contains("science-micro-mission");
  const hero = card.querySelector(".sa-level-hero,.science-level-hero");
  const orbit = card.querySelector(".science-micro-orbit");
  const orderedElements = card.querySelectorAll(isMicroMission
    ? [
        ".science-micro-visual",
        ".science-micro-content > .sa-level-progress",
        ".science-micro-content > .science-level-progress",
        ".science-micro-kicker",
        ".science-micro-content > h2",
        ".science-micro-concept",
        ".science-micro-example",
        ".science-micro-launch",
      ].join(",")
    : [
        ".sa-briefing-visual",
        ".sa-briefing-content > .sa-level-progress",
        ".sa-briefing-content > .sa-question-badge",
        ".sa-briefing-content > h2",
        ".sa-briefing-content > p",
        ".sa-level-challenge",
        ".sa-concept-grid > div",
        ".sa-mission-hint",
        ".sa-start-level",
      ].join(","));
  const timeline = createTimeline({ defaults: { ease: "out(4)" } });
  timeline.add(card, {
    scale: [.992, 1],
    duration: motionDuration(400),
  }, 0);
  if (hero?.tagName === "IMG") {
    timeline.add(hero, {
      scale: [1.035, 1],
      duration: motionDuration(900),
      ease: "out(3)",
    }, 80);
  }
  if (orbit) {
    timeline.add(orbit, {
      rotate: [-55, 0],
      opacity: [0, 1],
      duration: motionDuration(900),
      ease: "out(3)",
    }, 120);
  }
  addSproutSequence(timeline, orderedElements, {
    start: 70,
    total: isMicroMission ? 1750 : 1900,
    duration: 450,
    distance: 18,
  });
}

function animateResultCard(card) {
  if (animatedCards.has(card) || motionIsReduced()) return;
  animatedCards.add(card);
  const orderedElements = card.querySelectorAll([
    ".sa-result-icon",
    ".sa-level-stars i",
    ":scope > .sa-level-progress",
    ":scope > small",
    ":scope > h2",
    ":scope > p",
    ".sa-score-earned",
    ".sa-score-summary > div",
    ".sa-player-rank",
    ".sa-result-actions button",
  ].join(","));
  const timeline = createTimeline({ defaults: { ease: "out(5)" } });
  timeline.add(card, {
    scale: [.99, 1],
    duration: motionDuration(400),
  }, 0);
  addSproutSequence(timeline, orderedElements, {
    start: 90,
    total: 2600,
    duration: 570,
    distance: 26,
  });
}

function animateStructuredGame(game) {
  if (animatedStructuredGames.has(game) || motionIsReduced()) return;
  animatedStructuredGames.add(game);
  const telemetryModules = [...game.querySelectorAll(
    ".science-telemetry-heading, .science-telemetry-module",
  )];
  const context = game.querySelector(".science-structured-context");
  const sections = [
    game.querySelector(":scope > header"),
    ...(telemetryModules.length ? telemetryModules : [context]),
    game.querySelector(".science-structured-status"),
    game.querySelector(".science-structured-board"),
    game.querySelector(".science-numeric-console-heading"),
    game.querySelector(".science-numeric-input"),
    game.querySelector(".science-structured-evidence"),
    game.querySelector(":scope > footer"),
  ].filter(Boolean);
  const timeline = createTimeline({ defaults: { ease: "out(4)" } });
  timeline.add(game, {
    scale: [.992, 1],
    duration: motionDuration(360),
  }, 0);
  addSproutSequence(timeline, sections, {
    start: 80,
    total: 1750,
    duration: 440,
    distance: 17,
  });
}

function animateSimulator(shell) {
  if (animatedSimulators.has(shell) || motionIsReduced()) return;
  animatedSimulators.add(shell);
  const sections = shell.querySelectorAll(
    ":scope > header, .sa-simulator-visual, .sa-simulator-workbench > aside, .sa-simulator-controls > label, :scope > footer",
  );
  const timeline = createTimeline({ defaults: { ease: "out(4)" } });
  timeline.add(shell, {
    scale: [.992, 1],
    duration: motionDuration(380),
  }, 0);
  addSproutSequence(timeline, sections, {
    start: 100,
    total: 1800,
    duration: 450,
    distance: 17,
  });
}

function animateScope(scope) {
  if (!(scope instanceof Element) || motionIsReduced()) return;
  elementsWithin(scope, ".sa-level-briefing").forEach(animateLevelBriefing);
  elementsWithin(scope, ".sa-result-card").forEach(animateResultCard);
  elementsWithin(scope, ".sa-question-card:not(.sa-level-briefing):not(.sa-result-card)")
    .forEach(animateStandardQuestionCard);
  elementsWithin(scope, ".sa-question-context").forEach(animateQuestionHud);
  elementsWithin(scope, ".science-structured-game").forEach(animateStructuredGame);
  elementsWithin(scope, ".sa-simulator-shell").forEach(animateSimulator);
}

function animateInteractive(target, state) {
  if (!target || motionIsReduced() || target.disabled) return;
  removeAnimation(target);
  const config = state === "down"
    ? { scale: .965, y: 1, duration: 115, ease: "out(3)" }
    : state === "over"
      ? { scale: 1.025, y: -2, duration: 220, ease: "out(4)" }
      : { scale: 1, y: 0, duration: 260, ease: "out(4)" };
  animate(target, config);
}

function createClickPulse(target, event) {
  if (motionIsReduced() || !target || target.disabled) return;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pulse = document.createElement("span");
  pulse.className = "sa-anime-click-pulse";
  pulse.setAttribute("aria-hidden", "true");
  const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX - rect.left : rect.width / 2;
  const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY - rect.top : rect.height / 2;
  pulse.style.left = `${x}px`;
  pulse.style.top = `${y}px`;
  target.append(pulse);
  animate(pulse, {
    opacity: [.42, 0],
    scale: [.15, 2.7],
    duration: motionDuration(520),
    ease: "out(3)",
    onComplete: () => pulse.remove(),
  });
}

function installInteractiveMotion(root, controller) {
  const canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === true;
  root.addEventListener("pointerover", (event) => {
    if (!canHover) return;
    const target = event.target.closest(INTERACTIVE_TARGETS);
    if (!target || target.contains(event.relatedTarget)) return;
    animateInteractive(target, "over");
  }, { signal: controller.signal });
  root.addEventListener("pointerout", (event) => {
    if (!canHover) return;
    const target = event.target.closest(INTERACTIVE_TARGETS);
    if (!target || target.contains(event.relatedTarget)) return;
    animateInteractive(target, "out");
  }, { signal: controller.signal });
  root.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(INTERACTIVE_TARGETS);
    if (!target) return;
    animateInteractive(target, "down");
    createClickPulse(target, event);
  }, { signal: controller.signal });
  root.addEventListener("pointerup", (event) => {
    animateInteractive(event.target.closest(INTERACTIVE_TARGETS), canHover ? "over" : "out");
  }, { signal: controller.signal });
  root.addEventListener("pointercancel", (event) => {
    animateInteractive(event.target.closest(INTERACTIVE_TARGETS), "out");
  }, { signal: controller.signal });
}

function cleanRemovedMotion(scope) {
  if (!(scope instanceof Element)) return;
  const targets = [scope, ...scope.querySelectorAll(MOTION_TARGETS), ...scope.querySelectorAll("*")];
  removeAnimation(targets);
}

export function installScienceActivitiesMotion(root) {
  if (!(root instanceof Element)) return () => {};
  const existing = installedRoots.get(root);
  if (existing) return existing.destroy;

  const controller = new AbortController();
  const observer = new MutationObserver((records) => {
    const added = [];
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) added.push(node);
      });
      record.removedNodes.forEach(cleanRemovedMotion);
    });
    added.forEach(animateScope);
  });
  observer.observe(root, { childList: true, subtree: true });
  installInteractiveMotion(root, controller);
  animateScope(root);

  const destroy = () => {
    observer.disconnect();
    controller.abort();
    cleanRemovedMotion(root);
    installedRoots.delete(root);
  };
  installedRoots.set(root, { observer, controller, destroy });
  return destroy;
}
