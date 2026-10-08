// MediaRecorder records wall-clock time. Request frames only after composition;
// automatic capture must never sample an asynchronously half-painted canvas.
export function createBrowserMontageCapture(canvas, fps) {
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0];
  const manual = typeof track?.requestFrame === "function";
  if (!manual) {
    stream.getTracks().forEach((item) => item.stop());
    stream = canvas.captureStream(fps);
    track = stream.getVideoTracks()[0];
  }
  return {
    stream,
    manual,
    requestFrame() {
      if (manual) track.requestFrame();
    }
  };
}

export function nextBrowserMontageFrameIndex(frameIndex, elapsedMs, fps) {
  // Do not burst through expired deadlines after a slow draw. Video and audio
  // continue against the same real-time clock, with one draw per future slot.
  return Math.max(frameIndex + 1, Math.floor(Math.max(0, elapsedMs) * fps / 1000) + 1);
}
