// Copyright © 2026 · SPDX-License-Identifier: MIT
/**
 * dsh-request-image-cap: keep every transmitted image inside the provider's
 * per-side pixel limit.
 *
 * WHY THIS EXISTS (2026-09-20)
 * A chat died with HTTP 400 from the Anthropic Messages API:
 *   messages.10.content.5.image.source.base64.data: At least one of the image
 *   dimensions exceed max allowed size for many-image requests: 2000 pixels
 * DSH's attachment store normalises on AREA (4 194 304 px² by default) and caps
 * the side at 8192 px, so full-page screenshots land in the store at shapes like
 * 828 x 5059 and are transmitted verbatim. Anthropic accepts 8000 px per side
 * for a small request but only 2000 px once a request carries many images, so
 * the failure appears late, in a long session, and then repeats on every retry
 * because the oversized bytes are already in the history.
 *
 * WHAT IT DOES
 * Wraps `ctx.attachments.readImageRequest(ref, policy, signal)`, the single
 * seam every LLM adapter uses to materialise request bytes, and tightens the
 * route's area budget for that one image so its long edge lands at or under the
 * cap. Route policy is never widened, stored bytes are never touched, and the
 * variant cache keys on the budget, so clamped variants cache independently.
 * Because it acts at request time it also repairs sessions whose history
 * already contains oversized images.
 */
import { clampPolicy, DEFAULT_MAX_DIMENSION } from './clamp.js';

export const name = 'request-image-cap';
export const inject = ['attachments'];

const PATCHED = Symbol.for('dsh-request-image-cap.patched');

/**
 * Validate the plugin section.
 * @param {object} [config] - raw config from the cordis entry.
 * @returns {{enabled: boolean, maxDimension: number, verbose: boolean}} resolved config.
 */
export function validateConfig(config = {}) {
  const { enabled = true, maxDimension = DEFAULT_MAX_DIMENSION, verbose = false } = config ?? {};
  if (typeof enabled !== 'boolean' || typeof verbose !== 'boolean')
    throw new Error('request-image-cap: enabled and verbose must be booleans');
  if (!Number.isSafeInteger(maxDimension) || maxDimension < 64 || maxDimension > 8192)
    throw new Error('request-image-cap: maxDimension must be an integer from 64 through 8192');
  return { enabled, maxDimension, verbose };
}

/** Find the prototype that actually owns `readImageRequest`. */
function owningPrototype(instance) {
  let proto = Object.getPrototypeOf(instance);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'readImageRequest')) proto = Object.getPrototypeOf(proto);
  return proto;
}

/**
 * Install the cap on the mounted attachment store.
 * @param {object} ctx - cordis context with the `attachments` service injected.
 * @param {object} [rawConfig] - entry config.
 */
export function apply(ctx, rawConfig) {
  const config = validateConfig(rawConfig);
  if (!config.enabled) return;

  const store = typeof ctx.get === 'function' ? ctx.get('attachments') : ctx.attachments;
  const proto = store === undefined || store === null ? undefined : owningPrototype(store);
  const original = proto?.readImageRequest;
  if (typeof original !== 'function') {
    // Fail loudly but harmlessly: a core rename must not take the app down.
    ctx.logger?.warn?.('request-image-cap: attachments.readImageRequest is missing; images are transmitted uncapped');
    return;
  }
  if (original[PATCHED] === true) return;

  const { maxDimension, verbose } = config;
  const logger = ctx.logger;
  function readImageRequest(ref, policy, signal) {
    const next = clampPolicy(ref, policy, maxDimension);
    if (verbose && next !== policy)
      logger?.info?.(`request-image-cap: ${ref?.width}x${ref?.height} -> pixel budget ${next.maxPixels} (cap ${maxDimension}px/side)`);
    return original.call(this, ref, next, signal);
  }
  readImageRequest[PATCHED] = true;
  Object.defineProperty(readImageRequest, 'name', { value: 'readImageRequest' });
  proto.readImageRequest = readImageRequest;
  logger?.info?.(`request-image-cap: active, ${maxDimension}px per side`);

  const restore = () => {
    if (proto.readImageRequest === readImageRequest) proto.readImageRequest = original;
  };
  if (typeof ctx.effect === 'function') ctx.effect(() => restore);
  else ctx.on?.('dispose', restore);
}

export default { name, inject, apply };
