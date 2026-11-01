// Copyright © 2026 · SPDX-License-Identifier: MIT
/**
 * Pure geometry for the request-image per-side cap.
 *
 * DSH projects a stored attachment into a model request through
 * `requestImageDimensions(width, height, policy.maxPixels)`: an AREA budget
 * only (default 4 194 304 px² on the pi-ai routes). A tall screenshot such as
 * 828 x 5059 fits that budget exactly and is transmitted at its full 5059 px
 * long edge, which the Anthropic Messages API refuses with
 *
 *   "At least one of the image dimensions exceed max allowed size for
 *    many-image requests: 2000 pixels"
 *
 * as soon as the request carries more than ~20 images.
 *
 * Converting a per-SIDE cap into the area budget that produces it is exact:
 * `requestImageDimensions` scales by `sqrt(maxPixels / (w*h))` and then floors,
 * so asking for
 *
 *   maxPixels' = floor(w * h * (cap / max(w, h))²)
 *
 * yields a long edge of at most `floor(cap)` = cap, aspect ratio preserved.
 * The short edge is derived from the long one and is never larger.
 */

/** Largest per-side size Anthropic accepts once a request carries many images. */
export const DEFAULT_MAX_DIMENSION = 2000;

/**
 * Area budget that forces a given source through a per-side cap.
 * @param {number} width - source width in pixels.
 * @param {number} height - source height in pixels.
 * @param {number} maxDimension - per-side cap in pixels.
 * @returns {number} a positive pixel-area budget.
 */
export function pixelBudgetForSideCap(width, height, maxDimension) {
  const longEdge = Math.max(width, height);
  const scale = maxDimension / longEdge;
  return Math.max(1, Math.floor(width * height * scale * scale));
}

/**
 * Tighten one route-owned request-image policy for one attachment reference.
 * Returns the policy unchanged when the source already fits, when the route
 * budget is already tighter, or when the reference carries no usable size:
 * this never widens a route's own limits.
 * @param {{width?: number, height?: number}} ref - durable attachment reference.
 * @param {{maxPixels?: number, maxBytes?: number}} policy - route request policy.
 * @param {number} maxDimension - per-side cap in pixels.
 * @returns {object} the original policy, or a copy with a smaller `maxPixels`.
 */
export function clampPolicy(ref, policy, maxDimension = DEFAULT_MAX_DIMENSION) {
  const width = ref?.width;
  const height = ref?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return policy;
  if (!Number.isSafeInteger(maxDimension) || maxDimension <= 0) return policy;
  if (Math.max(width, height) <= maxDimension) return policy;
  const budget = pixelBudgetForSideCap(width, height, maxDimension);
  const current = policy?.maxPixels;
  if (Number.isFinite(current) && current <= budget) return policy;
  return { ...policy, maxPixels: budget };
}
