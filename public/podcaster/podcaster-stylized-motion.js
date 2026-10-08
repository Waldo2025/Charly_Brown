export const STYLIZED_MOTION_PRESETS = Object.freeze([
  "none", "fade-rise", "slide-reveal", "spring-pop", "soft-float"
]);

export function normalizeStylizedMotion(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const preset = STYLIZED_MOTION_PRESETS.includes(source.preset) ? source.preset : "none";
  const exit = ["none", "fade", "slide"].includes(source.exit) ? source.exit : "none";
  return {
    preset,
    exit,
    durationSec: Math.min(3, Math.max(0.2, Number(source.durationSec || 0.8) || 0.8)),
    intensity: Math.min(1.5, Math.max(0.25, Number(source.intensity || 1) || 1))
  };
}

export function createStylizedMotionTimeline({ gsap, canvas, objects, motion, sceneDurationSec = 8 }) {
  if (!gsap?.timeline || !canvas || !Array.isArray(objects)) return null;
  const spec = normalizeStylizedMotion(motion);
  const total = Math.max(0.5, Number(sceneDurationSec || 8) || 8);
  const enter = Math.min(spec.durationSec, total / 3);
  const exitStart = Math.max(enter, total - enter);
  const originals = objects.map((object) => ({
    object,
    left: Number(object.left || 0), top: Number(object.top || 0),
    opacity: Number(object.opacity ?? 1),
    scaleX: Number(object.scaleX || 1), scaleY: Number(object.scaleY || 1)
  }));
  const timeline = gsap.timeline({ paused: true, onUpdate: () => canvas.renderAll() });
  originals.forEach(({ object, left, top, opacity, scaleX, scaleY }) => {
    if (spec.preset === "fade-rise" || spec.preset === "soft-float") {
      timeline.fromTo(object, { top: top + 60 * spec.intensity, opacity: 0 },
        { top, opacity, duration: enter, ease: "power3.out", immediateRender: false }, 0);
    } else if (spec.preset === "slide-reveal") {
      timeline.fromTo(object, { left: left - 90 * spec.intensity, opacity: 0 },
        { left, opacity, duration: enter, ease: "power3.out", immediateRender: false }, 0);
    } else if (spec.preset === "spring-pop") {
      timeline.fromTo(object, { scaleX: scaleX * 0.72, scaleY: scaleY * 0.72, opacity: 0 },
        { scaleX, scaleY, opacity, duration: enter, ease: "back.out(1.6)", immediateRender: false }, 0);
    }
    if (spec.preset === "soft-float" && exitStart > enter + 0.2) {
      timeline.fromTo(object, { top }, { top: top - 10 * spec.intensity, duration: exitStart - enter, ease: "sine.inOut", immediateRender: false }, enter);
    }
    if (spec.exit === "fade") {
      timeline.to(object, { opacity: 0, duration: total - exitStart, ease: "power2.in" }, exitStart);
    } else if (spec.exit === "slide") {
      timeline.to(object, { left: left + 70 * spec.intensity, opacity: 0, duration: total - exitStart, ease: "power2.in" }, exitStart);
    }
  });
  if (timeline.duration() < total) timeline.to({}, { duration: total - timeline.duration() }, timeline.duration());
  return {
    timeline,
    seek: (seconds) => { timeline.seek(Math.max(0, Math.min(total, Number(seconds || 0)))); canvas.renderAll(); },
    play: () => timeline.restart(),
    restore: () => {
      timeline.kill();
      originals.forEach(({ object, left, top, opacity, scaleX, scaleY }) => object.set({ left, top, opacity, scaleX, scaleY }));
      canvas.renderAll();
    }
  };
}

export function createStylizedImageMotionTimeline({ gsap, element, motion, sceneDurationSec = 8 }) {
  if (!gsap?.timeline || !element) return null;
  const spec = normalizeStylizedMotion(motion);
  const total = Math.max(0.5, Number(sceneDurationSec || 8) || 8);
  const motionScale = Math.max(0.1, Number(element.offsetWidth || 1280) / 1280);
  const enter = Math.min(spec.durationSec, total / 3);
  const exitStart = Math.max(enter, total - enter);
  const timeline = gsap.timeline({ paused: true });
  gsap.set(element, { x: 0, y: 0, scale: 1, opacity: 1, transformOrigin: "50% 50%" });
  if (spec.preset === "fade-rise" || spec.preset === "soft-float") {
    timeline.fromTo(element, { y: 60 * spec.intensity * motionScale, opacity: 0 },
      { y: 0, opacity: 1, duration: enter, ease: "power3.out", immediateRender: false }, 0);
  } else if (spec.preset === "slide-reveal") {
    timeline.fromTo(element, { x: -90 * spec.intensity * motionScale, opacity: 0 },
      { x: 0, opacity: 1, duration: enter, ease: "power3.out", immediateRender: false }, 0);
  } else if (spec.preset === "spring-pop") {
    timeline.fromTo(element, { scale: 0.72, opacity: 0 },
      { scale: 1, opacity: 1, duration: enter, ease: "back.out(1.6)", immediateRender: false }, 0);
  }
  if (spec.preset === "soft-float" && exitStart > enter + 0.2) {
    timeline.to(element, { y: -10 * spec.intensity * motionScale, duration: exitStart - enter, ease: "sine.inOut" }, enter);
  }
  if (spec.exit === "fade") {
    timeline.to(element, { opacity: 0, duration: total - exitStart, ease: "power2.in" }, exitStart);
  } else if (spec.exit === "slide") {
    timeline.to(element, { x: 70 * spec.intensity * motionScale, opacity: 0, duration: total - exitStart, ease: "power2.in" }, exitStart);
  }
  if (timeline.duration() < total) timeline.to({}, { duration: total - timeline.duration() }, timeline.duration());
  return {
    timeline,
    seek: (seconds) => { timeline.seek(Math.max(0, Math.min(total, Number(seconds || 0)))); },
    play: () => timeline.restart(),
    staticStartSec: spec.preset === "none" ? 0 : enter,
    staticEndSec: spec.preset === "soft-float" ? 0 : exitStart,
    restore: () => { timeline.kill(); gsap.set(element, { clearProps: "transform,opacity" }); }
  };
}
