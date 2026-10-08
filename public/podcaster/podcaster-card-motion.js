const PREMIUM_MODELS = new Set([
  "editorial-lower-third", "frosted-glass", "gradient-mesh",
  "minimal-outline", "quote-premium", "signal-premium"
]);

export function isPremiumCard(styleModel) {
  return PREMIUM_MODELS.has(String(styleModel || ""));
}

export function createCardMotionTimeline({ gsap, element, card } = {}) {
  if (!gsap || !element) throw new Error("card_motion_runtime_unavailable");
  const duration = Math.max(0.5, Number(card?.durationMs || 4000) / 1000);
  const stageScale = Math.max(0.1, Number(element.parentElement?.clientWidth || 1280) / 1280);
  const exitAt = Math.min(duration - 0.12, Math.max(0.12, Number(card?.exitDelayMs ?? (duration * 1000 - 520)) / 1000));
  const enter = String(card?.enterAnimation || "slide-left");
  const exit = String(card?.exitAnimation || "fade");
  const enterFrom = { opacity: 0, x: 0, y: 0, scale: 1 };
  if (enter === "slide-left") enterFrom.x = -70 * stageScale;
  if (enter === "slide-right") enterFrom.x = 70 * stageScale;
  if (enter === "slide-up") enterFrom.y = -55 * stageScale;
  if (enter === "slide-down") enterFrom.y = 55 * stageScale;
  if (card?.animationPreset === "kinetic-rise") enterFrom.scale = 0.94;
  const exitTo = { opacity: 0, x: 0, y: 0, scale: 1 };
  if (exit === "slide-left") exitTo.x = -65 * stageScale;
  if (exit === "slide-right") exitTo.x = 65 * stageScale;
  if (exit === "slide-up") exitTo.y = -55 * stageScale;
  if (exit === "slide-down") exitTo.y = 55 * stageScale;
  const timeline = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
  const enterDuration = Math.min(0.6, Math.max(0.16, exitAt * 0.7));
  timeline.fromTo(element, enterFrom, {
    opacity: 1, x: 0, y: 0, scale: 1,
    duration: enterDuration,
    ease: card?.animationPreset === "kinetic-rise" ? "back.out(1.35)" : "power3.out"
  }, 0);
  const lines = element.querySelectorAll('.podcast-overlay-card-line');
  const lineStart = Math.min(0.16, exitAt * 0.2);
  const lineDuration = Math.min(0.34, Math.max(0.14, exitAt * 0.4));
  if (lines.length && card?.animationPreset !== 'gentle-fade') {
    timeline.fromTo(lines, { opacity: 0, y: 14 * stageScale }, {
      opacity: 1, y: 0, duration: lineDuration,
      stagger: 0.055, ease: 'power2.out'
    }, lineStart);
  }
  timeline.to(element, { ...exitTo, duration: Math.max(0.12, duration - exitAt), ease: "power2.inOut" }, exitAt);
  timeline.to({}, { duration: 0.001 }, duration);
  return {
    seek(timeSec) { timeline.time(Math.max(0, Math.min(duration, Number(timeSec) || 0)), false); },
    kill() { timeline.kill(); },
    durationSec: duration,
    staticStartSec: Math.max(enterDuration, lines.length && card?.animationPreset !== 'gentle-fade' ? lineStart + lineDuration + (lines.length - 1) * 0.055 : 0),
    staticEndSec: exitAt
  };
}
