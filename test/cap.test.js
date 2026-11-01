// Copyright © 2026 · SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { clampPolicy, pixelBudgetForSideCap } from '../src/clamp.js';
import { apply, validateConfig } from '../src/index.js';

// The real projection function the harness uses, resolved from the installed dsh.
const require = createRequire(import.meta.url);
// Locate the installed dsh: DSH_GLOBAL_PREFIX, else the global prefix of the running node.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
const REL = join('@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-attachment', 'lib', 'types', 'request-projection.js');
const prefixes = [process.env.DSH_GLOBAL_PREFIX, dirname(dirname(process.execPath))].filter(Boolean);
const CORE = prefixes.map((p) => join(p, 'lib', 'node_modules', REL)).find((f) => existsSync(f));
if (!CORE) throw new Error('installed dsh not found: set DSH_GLOBAL_PREFIX to the npm prefix that holds @deepseek-ai/dsh');
const { requestImageDimensions } = await import(CORE);

const CAP = 2000;
// Real shapes taken from ~/.dsh/attachments/v1/objects on 2026-09-20.
const STORED = [
  [828, 5059], [831, 5040], [857, 4887], [920, 4558], [704, 4216], [1006, 4168],
  [1229, 3411], [1920, 1080], [1512, 982], [3000, 600], [600, 3000], [2001, 2001],
];

test('every stored shape lands inside the per-side cap', () => {
  for (const [w, h] of STORED) {
    const policy = clampPolicy({ width: w, height: h }, { maxPixels: 4194304, maxBytes: 1048576 }, CAP);
    const out = requestImageDimensions(w, h, policy.maxPixels);
    assert.ok(Math.max(out.width, out.height) <= CAP, `${w}x${h} -> ${out.width}x${out.height}`);
    assert.ok(out.width >= 1 && out.height >= 1);
    // aspect ratio preserved within one pixel of rounding
    assert.ok(Math.abs(out.width / out.height - w / h) < 0.02, `aspect ${w}x${h}`);
  }
});

test('images already inside the cap are untouched', () => {
  const policy = { maxPixels: 4194304, maxBytes: 1048576 };
  assert.equal(clampPolicy({ width: 1920, height: 1080 }, policy, CAP), policy);
  assert.equal(clampPolicy({ width: 2000, height: 2000 }, policy, CAP), policy);
});

test('a tighter route budget is never widened', () => {
  const policy = { maxPixels: 100000, maxBytes: 1048576 };
  assert.equal(clampPolicy({ width: 828, height: 5059 }, policy, CAP), policy);
});

test('unusable references pass through unchanged', () => {
  const policy = { maxPixels: 4194304 };
  assert.equal(clampPolicy(undefined, policy, CAP), policy);
  assert.equal(clampPolicy({ width: 0, height: 10 }, policy, CAP), policy);
  assert.equal(clampPolicy({ width: 10.5, height: 10 }, policy, CAP), policy);
});

test('byte budget and other policy fields survive', () => {
  const next = clampPolicy({ width: 828, height: 5059 }, { maxPixels: 4194304, maxBytes: 999 }, CAP);
  assert.equal(next.maxBytes, 999);
  assert.ok(next.maxPixels < 4194304);
  assert.equal(pixelBudgetForSideCap(828, 5059, CAP), next.maxPixels);
});

test('validateConfig rejects nonsense', () => {
  assert.deepEqual(validateConfig(), { enabled: true, maxDimension: 2000, verbose: false });
  assert.throws(() => validateConfig({ maxDimension: 0 }));
  assert.throws(() => validateConfig({ maxDimension: 12000 }));
  assert.throws(() => validateConfig({ enabled: 'yes' }));
});

// --- apply() against a stand-in for the mounted store -----------------------
class BaseStore {
  async readImageRequest(ref, policy) { return { ref, policy }; }
}
class LocalStore extends BaseStore {}

function fakeCtx(store) {
  const disposers = [];
  return {
    store,
    disposers,
    logger: { info() {}, warn() {} },
    get(namez) { return namez === 'attachments' ? store : undefined; },
    effect(run) { const off = run(); if (typeof off === 'function') disposers.push(off); },
  };
}

test('apply clamps through the mounted service and restores on dispose', async () => {
  const store = new LocalStore();
  const ctx = fakeCtx(store);
  apply(ctx, { maxDimension: CAP });
  const clamped = await store.readImageRequest({ width: 828, height: 5059 }, { maxPixels: 4194304, maxBytes: 1048576 });
  const out = requestImageDimensions(828, 5059, clamped.policy.maxPixels);
  assert.ok(Math.max(out.width, out.height) <= CAP);
  const untouched = await store.readImageRequest({ width: 1024, height: 768 }, { maxPixels: 4194304 });
  assert.equal(untouched.policy.maxPixels, 4194304);
  for (const off of ctx.disposers) off();
  const restored = await store.readImageRequest({ width: 828, height: 5059 }, { maxPixels: 4194304 });
  assert.equal(restored.policy.maxPixels, 4194304);
});

test('apply is inert when the seam is gone and never throws', () => {
  const ctx = fakeCtx({});
  assert.doesNotThrow(() => apply(ctx, {}));
  assert.doesNotThrow(() => apply(fakeCtx(undefined), {}));
});

test('apply is idempotent', async () => {
  const store = new LocalStore();
  const ctx = fakeCtx(store);
  apply(ctx, { maxDimension: CAP });
  const once = Object.getPrototypeOf(store).readImageRequest;
  apply(fakeCtx(store), { maxDimension: CAP });
  assert.equal(Object.getPrototypeOf(store).readImageRequest, once);
  for (const off of ctx.disposers) off();
});
