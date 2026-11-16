import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSampleBuffers } from "./useSampleBuffers";

// Regression coverage for the live v14 crash: applying an AI plan that
// assigned a sample whose fetch failed tripped the app-wide ErrorBoundary.
// Root cause: loadSampleBuffer returned a rejecting promise to `void`
// call sites (preload effect, transport scheduler), so the failure
// surfaced as an unhandled rejection. It must never reject — failures
// resolve to null and are recorded in sampleLoadFailedRef.

function createDecodeContext(overrides = {}) {
  return {
    state: "running",
    resume: vi.fn(async function () {
      return undefined;
    }),
    decodeAudioData: vi.fn(async function () {
      return { duration: 1, length: 44100, sampleRate: 44100, numberOfChannels: 2 };
    }),
    ...overrides,
  };
}

describe("useSampleBuffers", function () {
  let fetchMock;

  beforeEach(function () {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(function () {
    vi.unstubAllGlobals();
  });

  it("resolves to null (never rejects) when the fetch fails, and records the failure", async function () {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const audioCtx = createDecodeContext();
    const { result } = renderHook(function () {
      return useSampleBuffers(function () {
        return audioCtx;
      });
    });

    let loaded;
    await act(async function () {
      loaded = await result.current.loadSampleBuffer("/packs/missing-loop.wav");
    });

    expect(loaded).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.sampleLoadFailedRef.current.size).toBe(1);
    expect(result.current.sampleBufferCacheRef.current.size).toBe(0);
  });

  it("resolves to null (never rejects) when decoding fails", async function () {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn(async function () {
        return new ArrayBuffer(8);
      }),
    });
    const audioCtx = createDecodeContext({
      decodeAudioData: vi.fn(async function () {
        throw new Error("bad audio");
      }),
    });
    const { result } = renderHook(function () {
      return useSampleBuffers(function () {
        return audioCtx;
      });
    });

    let loaded;
    await act(async function () {
      loaded = await result.current.loadSampleBuffer("/packs/corrupt-loop.wav");
    });

    expect(loaded).toBeNull();
    expect(result.current.sampleLoadFailedRef.current.size).toBe(1);
  });

  it("returns the decoded buffer on success and caches it", async function () {
    const decoded = { duration: 2, length: 88200, sampleRate: 44100, numberOfChannels: 2 };
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn(async function () {
        return new ArrayBuffer(8);
      }),
    });
    const audioCtx = createDecodeContext({
      decodeAudioData: vi.fn(async function () {
        return decoded;
      }),
    });
    const { result } = renderHook(function () {
      return useSampleBuffers(function () {
        return audioCtx;
      });
    });

    let first;
    let second;
    await act(async function () {
      first = await result.current.loadSampleBuffer("/packs/good-loop.wav");
    });
    await act(async function () {
      second = await result.current.loadSampleBuffer("/packs/good-loop.wav");
    });

    expect(first).toBe(decoded);
    expect(second).toBe(decoded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.sampleLoadFailedRef.current.size).toBe(0);
  });

  it("shares one safe promise between concurrent callers on failure", async function () {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const audioCtx = createDecodeContext();
    const { result } = renderHook(function () {
      return useSampleBuffers(function () {
        return audioCtx;
      });
    });

    let first;
    let second;
    await act(async function () {
      const promiseA = result.current.loadSampleBuffer("/packs/shared-fail.wav");
      const promiseB = result.current.loadSampleBuffer("/packs/shared-fail.wav");
      first = await promiseA;
      second = await promiseB;
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
