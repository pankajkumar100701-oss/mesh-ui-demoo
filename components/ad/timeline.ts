/** Length of the ad in seconds. Scroll position maps linearly onto this. */
export const DURATION = 30;

/**
 * Shared playhead. The page writes it (from the auto-play clock or from manual scrolling) and both the
 * 3D scene and the HTML overlay read it every frame, so they never drift apart.
 */
export const timeline = { t: 0 };

/** Beats of the ad, in seconds. */
export const BEATS = {
  intro: [0, 4.5],
  shaders: [4.5, 7],
  physics: [7, 9.5],
  glass: [9.5, 12],
  gallery: [12, 22],
  ship: [22, 26.5],
  outro: [26.5, 30],
} as const;

/** Gallery: first card faces the camera at GALLERY_START, then one card per GALLERY_STEP seconds. */
export const GALLERY_START = 12.4;
export const GALLERY_STEP = 0.93;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * c * (c * (c * 6 - 15) + 10);
};
/** 0→1 progress of t through [a, b]. */
export const range = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Fades in over `f` seconds after `a` and out over `f` seconds before `b`. */
export const windowed = (t: number, a: number, b: number, f = 0.5) =>
  smooth((t - a) / f) * (1 - smooth((t - (b - f)) / f));

/** Which gallery card is facing the camera, and how far through its turn (0 = holding, 1 = arrived at next). */
export function galleryIndex(t: number, count: number) {
  const u = Math.max(0, (t - GALLERY_START) / GALLERY_STEP);
  const i = Math.floor(u);
  // Hold each card for most of its slot, then swing to the next.
  const turn = smooth((u - i - 0.6) / 0.4);
  return { index: Math.min(i, count - 1), position: Math.min(i + turn, count - 1) };
}
