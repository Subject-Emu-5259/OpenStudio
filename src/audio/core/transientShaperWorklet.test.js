
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createTransientShaperNode,
  ensureTransientShaperWorklet,
  isTransientShaperWorkletReady,
} from "./transientShaperWorklet";
import { TRANSIENT_SHAPER_WORKLET_NAME } from "./transientShaperProcessor";

function createFakeContext(addModuleImpl) {
  return {
    currentTime: 0,
    audioWorklet: {
      addModule: addModuleImpl || vi.fn().mockResolvedValue(undefined),
    },
  };
}

afterEach(function () {
  // The ready-path test installs a mock AudioWorkletNode global; remove
  // it so other tests see the real jsdom state (undefined).
  delete globalThis.AudioWorkletNode;
});

describe("ensureTransientShaperWorklet", function () {
  it("resolves false without a context or without audioWorklet", async function () {
    await expect(ensureTransientShaperWorklet(null)).resolves.toBe(false);
    await expect(ensureTransientShaperWorklet({})).resolves.toBe(false);
    await expect(
      ensureTransientShaperWorklet({ audioWorklet: {} }),
    ).resolves.toBe(false);
  });

  it("registers the processor module and marks the context ready", async function () {
    const audioCtx = createFakeContext();
    expect(isTransientShaperWorkletReady(audioCtx)).toBe(false);

    await expect(ensureTransientShaperWorklet(audioCtx)).resolves.toBe(true);
    expect(isTransientShaperWorkletReady(audioCtx)).toBe(true);
    expect(audioCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    const moduleUrl = String(
      audioCtx.audioWorklet.addModule.mock.calls[0][0],
    );
    expect(moduleUrl).toContain("transientShaperProcessor.js");
  });

  it("loads at most once per context, even for concurrent callers", async function () {
    const audioCtx = createFakeContext();
    const first = ensureTransientShaperWorklet(audioCtx);
    const second = ensureTransientShaperWorklet(audioCtx);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(audioCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1);

    // A later call after a successful load does not re-add the module.
    await expect(ensureTransientShaperWorklet(audioCtx)).resolves.toBe(true);
    expect(audioCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });

  it("loads separately for different contexts", async function () {
    const firstCtx = createFakeContext();
    const secondCtx = createFakeContext();

    await ensureTransientShaperWorklet(firstCtx);
    expect(isTransientShaperWorkletReady(secondCtx)).toBe(false);

    await ensureTransientShaperWorklet(secondCtx);
    expect(isTransientShaperWorkletReady(secondCtx)).toBe(true);
    expect(firstCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(secondCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });

  it("resolves false and retries after a failed load", async function () {
    const addModule = vi
      .fn()
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValue(undefined);
    const audioCtx = createFakeContext(addModule);

    await expect(ensureTransientShaperWorklet(audioCtx)).resolves.toBe(false);
    expect(isTransientShaperWorkletReady(audioCtx)).toBe(false);

    await expect(ensureTransientShaperWorklet(audioCtx)).resolves.toBe(true);
    expect(addModule).toHaveBeenCalledTimes(2);
  });
});

describe("createTransientShaperNode", function () {
  it("returns null and kicks off the load when the module is not ready", async function () {
    const audioCtx = createFakeContext();
    expect(createTransientShaperNode(audioCtx)).toBeNull();
    // The load was started in the background; let it settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(audioCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });

  it("returns null without a context", function () {
    expect(createTransientShaperNode(null)).toBeNull();
  });

  it("creates the worklet node once the module is ready", async function () {
    const audioCtx = createFakeContext();
    await ensureTransientShaperWorklet(audioCtx);

    const created = [];
    globalThis.AudioWorkletNode = function (ctx, name, options) {
      created.push({ ctx, name, options });
      this.parameters = new Map();
      this.connect = vi.fn();
      this.disconnect = vi.fn();
    };

    const node = createTransientShaperNode(audioCtx);
    expect(node).not.toBeNull();
    expect(created).toHaveLength(1);
    expect(created[0].ctx).toBe(audioCtx);
    expect(created[0].name).toBe(TRANSIENT_SHAPER_WORKLET_NAME);
    expect(created[0].options.outputChannelCount).toEqual([2]);
  });

  it("returns null when the constructor throws", async function () {
    const audioCtx = createFakeContext();
    await ensureTransientShaperWorklet(audioCtx);

    globalThis.AudioWorkletNode = function () {
      throw new Error("not registered");
    };

    expect(createTransientShaperNode(audioCtx)).toBeNull();
  });
});
