/**
 * Decoding the packed grids the decision-surface tool produces.
 *
 * Values arrive as one signed byte per cell rather than as JSON numbers: a
 * twenty-round timeline is 0.6 MB packed against 7.9 MB as numbers, and the
 * values only ever become pixel colours, where 1/127 is finer than anything
 * visible.
 */

/** Decode base64 int8 into values in [-1, 1]. */
export function decodeGrid(encoded: string): Float32Array {
  const binary = atob(encoded);
  const out = new Float32Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    const byte = binary.charCodeAt(i);
    // charCodeAt gives 0..255; reinterpret the high half as negative.
    out[i] = (byte > 127 ? byte - 256 : byte) / 127;
  }

  return out;
}

/**
 * Blend two grids.
 *
 * Playback interpolates between consecutive rounds rather than cutting between
 * them, so the boundary is seen deforming into its next shape instead of
 * jumping. Training is discrete, so the in-between frames are a reading aid,
 * not data -- which is why scrubbing lands exactly on a round.
 */
export function lerpGrids(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] + (b[i] - a[i]) * t;
  }
  return out;
}
