// Lazy, idempotent loader for the transient-shaper AudioWorklet module.
//
// AudioWorklet modules load asynchronously (addModule returns a
// promise), but the mixer graph is built synchronously — so the graph
// builder can only create the real worklet node when the module is
// already registered for that context. Everything else falls back to a
// unity-gain node and upgrades later (see upgradeTransientWorkletNodes
// in createMixerInsertNodes.js).
//
// One load per AudioContext: the promise is cached in a WeakMap, so
// concurrent callers share the same load and a second call after a
// successful load resolves immediately. A failed load resolves false
// (never rejects) so callers can keep the fallback path.

import { TRANSIENT_SHAPER_WORKLET_NAME } from "./transientShaperProcessor";

const workletLoadPromises = new WeakMap();
const workletReadyContexts = new WeakSet();

/**
 * Registers the transient-shaper worklet module on the given context.
 * Safe to call repeatedly and concurrently: at most one addModule runs
 * per context. Resolves true when the module is registered, false when
 * the context has no audioWorklet (old browsers, test fakes) or the
 * load fails.
 */
export function ensureTransientShaperWorklet(audioCtx) {
  if (!audioCtx) {
    return Promise.resolve(false);
  }
  if (workletReadyContexts.has(audioCtx)) {
    return Promise.resolve(true);
  }

  const pending = workletLoadPromises.get(audioCtx);
  if (pending) {
    return pending;
  }

  const promise = (async function () {
    try {
      const audioWorklet = audioCtx.audioWorklet;
      if (!audioWorklet || typeof audioWorklet.addModule !== "function") {
        return false;
      }
      // Vite emits the processor file as a standalone asset (it has no
      // imports, so it runs unchanged in the worklet global scope).
      await audioWorklet.addModule(
        new URL("./transientShaperProcessor.js", import.meta.url),
      );
      workletReadyContexts.add(audioCtx);
      return true;
    } catch {
      // A failed load (missing file, CSP, offline-context quirk) must
      // never break graph construction — the caller keeps the fallback.
      // Drop the cached promise so a later call retries: a transient
      // failure should not disable the effect for the context's life.
      workletLoadPromises.delete(audioCtx);
      return false;
    }
  })();

  workletLoadPromises.set(audioCtx, promise);
  return promise;
}

/**
 * Synchronous readiness check for the graph builder: true only after
 * ensureTransientShaperWorklet has resolved true for this context.
 */
export function isTransientShaperWorkletReady(audioCtx) {
  return Boolean(audioCtx) && workletReadyContexts.has(audioCtx);
}

/**
 * Creates the worklet node when the module is registered for this
 * context, or null when it is not (yet). A null result also kicks off
 * the module load in the background, so a later graph build — or the
 * upgrade path — can swap the real node in.
 */
export function createTransientShaperNode(audioCtx) {
  if (!audioCtx || !isTransientShaperWorkletReady(audioCtx)) {
    if (audioCtx) {
      void ensureTransientShaperWorklet(audioCtx);
    }
    return null;
  }

  // AudioWorkletNode is a browser global; jsdom (unit tests) does not
  // define it, so the constructor call is guarded the same way.
  if (typeof AudioWorkletNode === "undefined") {
    return null;
  }

  try {
    return new AudioWorkletNode(audioCtx, TRANSIENT_SHAPER_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  } catch {
    // The module may have been registered under a different name, or
    // the context may be closed — the caller keeps the fallback.
    return null;
  }
}
