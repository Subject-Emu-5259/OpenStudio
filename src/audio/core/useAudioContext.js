import { useCallback, useRef } from "react";
import { ensureTransientShaperWorklet } from "./transientShaperWorklet";

/**
 * Manages the singleton Web Audio AudioContext for the application.
 *
 * Browsers require user interaction before an AudioContext can transition
 * from "suspended" to "running".  This hook encapsulates context creation
 * and the resume logic so that every consumer simply calls ensureContext()
 * and receives a ready-to-use context.
 */
export function useAudioContext() {
  const audioCtxRef = useRef(null);

  /**
   * Lazily creates the AudioContext on first call and returns it.
   * Callers must await audioCtx.resume() if they need the context to be
   * in "running" state (e.g. before scheduling real-time playback).
   */
  const ensureContext = useCallback(function () {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      // Start loading the transient-shaper worklet module now so it is
      // usually registered before the first mixer graph is built. The
      // graph builder falls back to a unity gain when the module is not
      // ready yet, and useMixerGraph upgrades the fallback later — so
      // this preload is an optimization, not a correctness requirement.
      void ensureTransientShaperWorklet(audioCtxRef.current);
    }
    return audioCtxRef.current;
  }, []);

  return {
    audioCtxRef,
    ensureContext,
  };
}
