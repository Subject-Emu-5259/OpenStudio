import { useCallback, useRef } from "react";
import { toSafeSampleUrl } from "../../utils/sampleUrl";

/**
 * Manages asynchronous loading and in-memory caching of AudioBuffer samples.
 *
 * Samples are fetched once, decoded with the active AudioContext, and then
 * stored in a Map so that multiple channels or patterns can reuse the same
 * buffer without redundant network requests.
 *
 * @param {() => AudioContext} ensureContext
 */
export function useSampleBuffers(ensureContext) {
  const sampleBufferCacheRef = useRef(new Map());
  const sampleLoadPromiseRef = useRef(new Map());
  const sampleLoadFailedRef = useRef(new Set());

  const loadSampleBuffer = useCallback(
    async function (sampleRef) {
      const sampleUrl = toSafeSampleUrl(sampleRef);
      if (!sampleUrl) {
        return null;
      }

      const cached = sampleBufferCacheRef.current.get(sampleUrl);
      if (cached) {
        return cached;
      }

      const pending = sampleLoadPromiseRef.current.get(sampleUrl);
      if (pending) {
        return pending;
      }

      const request = (async function () {
        const audioCtx = ensureContext();
        const response = await fetch(sampleUrl);
        if (!response.ok) {
          throw new Error("Sample request failed");
        }

        const data = await response.arrayBuffer();
        const decodedBuffer = await audioCtx.decodeAudioData(data.slice(0));

        sampleBufferCacheRef.current.set(sampleUrl, decodedBuffer);
        sampleLoadFailedRef.current.delete(sampleUrl);
        return decodedBuffer;
      })();

      // This promise must never reject: every call site fires it with
      // `void` (preload effect, transport scheduler), and a rejected
      // promise with no handler is an unhandled rejection — which the
      // app-wide ErrorBoundary used to turn into a full-workspace crash
      // screen. A failed load (404, bad decode) is not a broken UI:
      // record it in sampleLoadFailedRef and resolve to null, which
      // every caller already handles. Note the .catch must wrap the
      // promise we RETURN (and store for dedup): catching `request`
      // alone leaves the async wrapper's adopted rejection unhandled.
      const safeRequest = request.catch(function () {
        sampleLoadFailedRef.current.add(sampleUrl);
        sampleLoadPromiseRef.current.delete(sampleUrl);
        return null;
      });

      sampleLoadPromiseRef.current.set(sampleUrl, safeRequest);

      return safeRequest;
    },
    [ensureContext],
  );

  return {
    sampleBufferCacheRef,
    sampleLoadPromiseRef,
    sampleLoadFailedRef,
    loadSampleBuffer,
  };
}
