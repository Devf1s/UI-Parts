/**
 * A requestAnimationFrame loop that only runs while there is something to animate: `tick` returns
 * true to get another frame, and the loop stops itself as soon as it returns false, the element is
 * off screen or the tab is hidden. `wake()` starts it again. An idle page costs nothing.
 */
export function createLoop(tick: (dt: number) => boolean) {
  let raf = 0;
  let last = 0;
  let visible = true;
  const frame = (now: number) => {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    if (tick(dt) && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };
  return {
    wake() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    },
    stop,
    visible(on: boolean) {
      visible = on;
      if (!on) stop();
    },
    running: () => raf !== 0,
  };
}

export type Loop = ReturnType<typeof createLoop>;

/** Keeps a canvas' backing store at its CSS size × DPR (capped). Returns the scale it applied. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { width: r.width, height: r.height, dpr };
}

/** Test hook every effect canvas exposes as `canvas.__fx`. */
export type FxHandle = { running(): boolean; energy(): number };
export const exposeFx = (canvas: HTMLCanvasElement, fx: FxHandle) => ((canvas as HTMLCanvasElement & { __fx?: FxHandle }).__fx = fx);
