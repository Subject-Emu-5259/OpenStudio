// Canonical effect IDs shared by store, scheduler and UI editors.
export const FX_EFFECT_NONE = "none";
export const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
export const FX_EFFECT_REVERB = "reverb";
export const FX_EFFECT_MAXIMIZER = "maximizer";
export const FX_EFFECT_COMPRESSOR = "compressor";
export const FX_EFFECT_SATURATION = "saturation";
export const FX_EFFECT_FILTER = "filter";
export const FX_EFFECT_DELAY = "delay";
export const FX_EFFECT_CHORUS = "chorus";
export const FX_EFFECT_TRANSIENT = "transient";

// Fixed 7-point EQ layout used by the built-in EQ editor.
export const GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES = [
  50, 100, 250, 500, 1000, 3000, 8000,
];

// Supported biquad families for per-point EQ shaping.
export const GRAPHIC_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
];

import { clamp } from "../../store/utils";

const MAXIMIZER_MODES = ["irc-ll", "irc-i", "irc-ii", "irc-iii", "irc-iv"];

export function getDefaultEqBandType(index) {
  // Outer points default to shelves, middle points to bell filters.
  if (index === 0) {
    return "lowshelf";
  }
  if (index === GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1) {
    return "highshelf";
  }
  return "peaking";
}

export function sanitizeEqBandType(raw, fallback) {
  const requested = String(raw || "")
    .trim()
    .toLowerCase();
  if (GRAPHIC_EQ_BAND_TYPES.includes(requested)) {
    return requested;
  }

  const safeFallback = String(fallback || "")
    .trim()
    .toLowerCase();
  if (GRAPHIC_EQ_BAND_TYPES.includes(safeFallback)) {
    return safeFallback;
  }

  return "peaking";
}

export function getSafeGraphicEqParams(raw) {
  // Supports both modern "points" shape and legacy "bands" gain-only shape.
  const requestedPoints = Array.isArray(raw?.points) ? raw.points : [];
  const legacyBands = Array.isArray(raw?.bands) ? raw.bands : [];

  return {
    points: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(function (defaultFreq, index) {
      const requestedPoint = requestedPoints[index];
      const legacyGain = legacyBands[index];
      return {
        frequencyHz: clamp(Number(requestedPoint?.frequencyHz || defaultFreq), 20, 20000),
        gainDb: clamp(
          Number(requestedPoint?.gainDb ?? (Number.isFinite(legacyGain) ? legacyGain : 0)),
          -18,
          18,
        ),
        q: clamp(Number(requestedPoint?.q || 1.2), 0.25, 8),
        bandType: sanitizeEqBandType(
          requestedPoint?.bandType,
          getDefaultEqBandType(index),
        ),
      };
    }),
  };
}

export function getSafeReverbParams(raw) {
  // Defaults are tuned for musical but neutral small-room behavior.
  const base = {
    decayTime: 2.8,
    preDelayMs: 24,
    size: 0.62,
    damping: 0.45,
    hiCutHz: 9000,
    loCutHz: 130,
    earlyReflections: 0.38,
    diffusion: 0.72,
    modulationDepth: 0.22,
    modulationRateHz: 0.35,
    width: 0.9,
    dryWet: 0.34,
    freeze: false,
    ...(raw || {}),
  };

  return {
    decayTime: clamp(Number(base.decayTime ?? 2.8), 0.2, 20),
    preDelayMs: clamp(Number(base.preDelayMs ?? 24), 0, 250),
    size: clamp(Number(base.size ?? 0.62), 0, 1),
    damping: clamp(Number(base.damping ?? 0.45), 0, 1),
    hiCutHz: clamp(Number(base.hiCutHz ?? 9000), 1200, 18000),
    loCutHz: clamp(Number(base.loCutHz ?? 130), 20, 1200),
    earlyReflections: clamp(Number(base.earlyReflections ?? 0.38), 0, 1),
    diffusion: clamp(Number(base.diffusion ?? 0.72), 0, 1),
    modulationDepth: clamp(Number(base.modulationDepth ?? 0.22), 0, 1),
    modulationRateHz: clamp(Number(base.modulationRateHz ?? 0.35), 0, 8),
    width: clamp(Number(base.width ?? 0.9), 0, 1),
    dryWet: clamp(Number(base.dryWet ?? 0.34), 0, 1),
    freeze: Boolean(base.freeze),
  };
}

export function sanitizeMaximizerMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (MAXIMIZER_MODES.includes(requested)) {
    return requested;
  }
  return "irc-ii";
}

export function getSafeMaximizerParams(raw) {
  // Migrates old preset-like defaults to current neutral defaults.
  const legacyThreshold = Number(raw?.thresholdDb);
  const legacyCeiling = Number(raw?.ceilingDb);
  const legacyCharacter = Number(raw?.character);
  const legacyMode = sanitizeMaximizerMode(raw?.mode);
  const isLegacyDefault =
    Number.isFinite(legacyThreshold) &&
    Number.isFinite(legacyCeiling) &&
    Number.isFinite(legacyCharacter) &&
    Math.abs(legacyThreshold + 6) < 0.001 &&
    Math.abs(legacyCeiling + 0.1) < 0.001 &&
    Math.abs(legacyCharacter - 0.58) < 0.001 &&
    legacyMode === "irc-ii" &&
    Boolean(raw?.truePeakEnabled ?? true);

  const base = {
    mode: "irc-ii",
    truePeakEnabled: true,
    thresholdDb: 0,
    ceilingDb: -1,
    character: 0.5,
    ...(raw || {}),
  };

  if (isLegacyDefault) {
    base.thresholdDb = 0;
    base.ceilingDb = -1;
    base.character = 0.5;
  }

  return {
    mode: sanitizeMaximizerMode(base.mode),
    truePeakEnabled: Boolean(base.truePeakEnabled),
    thresholdDb: clamp(Number(base.thresholdDb ?? 0), -24, 0),
    ceilingDb: clamp(Number(base.ceilingDb ?? -1), -18, 0),
    character: clamp(Number(base.character ?? 0.5), 0, 1),
  };
}

export function getSafeCompressorParams(raw) {
  // Defaults are a gentle starting point: light gain reduction on peaks
  // with no makeup, so enabling the compressor never jumps the level.
  const base = {
    thresholdDb: -24,
    ratio: 4,
    kneeDb: 6,
    attackSec: 0.01,
    releaseSec: 0.18,
    makeupGainDb: 0,
    mix: 1,
    ...(raw || {}),
  };

  return {
    thresholdDb: clamp(Number(base.thresholdDb ?? -24), -60, 0),
    ratio: clamp(Number(base.ratio ?? 4), 1, 20),
    kneeDb: clamp(Number(base.kneeDb ?? 6), 0, 40),
    attackSec: clamp(Number(base.attackSec ?? 0.01), 0.0005, 0.5),
    releaseSec: clamp(Number(base.releaseSec ?? 0.18), 0.01, 1),
    makeupGainDb: clamp(Number(base.makeupGainDb ?? 0), 0, 24),
    mix: clamp(Number(base.mix ?? 1), 0, 1),
  };
}

const SATURATION_MODES = ["soft", "hard"];

export function sanitizeSaturationMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (SATURATION_MODES.includes(requested)) {
    return requested;
  }
  return "soft";
}

export function getSafeSaturationParams(raw) {
  // Defaults are a light warm-up: a little drive, tone centred, no level
  // change, so enabling saturation never jumps the level.
  const base = {
    drive: 0.3,
    mode: "soft",
    tone: 0.5,
    mix: 1,
    outputDb: 0,
    ...(raw || {}),
  };

  return {
    drive: clamp(Number(base.drive ?? 0.3), 0, 1),
    mode: sanitizeSaturationMode(base.mode),
    tone: clamp(Number(base.tone ?? 0.5), 0, 1),
    mix: clamp(Number(base.mix ?? 1), 0, 1),
    outputDb: clamp(Number(base.outputDb ?? 0), -12, 12),
  };
}

export const FILTER_MODES = ["lowpass", "highpass", "bandpass", "notch"];

export function sanitizeFilterMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (FILTER_MODES.includes(requested)) {
    return requested;
  }
  return "lowpass";
}

export function getSafeFilterParams(raw) {
  // Defaults are wide open (18 kHz lowpass) so enabling the filter is
  // transparent until the user sweeps the cutoff down.
  const base = {
    cutoffHz: 18000,
    resonance: 1,
    mode: "lowpass",
    mix: 1,
    ...(raw || {}),
  };

  return {
    cutoffHz: clamp(Number(base.cutoffHz ?? 18000), 20, 20000),
    resonance: clamp(Number(base.resonance ?? 1), 0.5, 20),
    mode: sanitizeFilterMode(base.mode),
    mix: clamp(Number(base.mix ?? 1), 0, 1),
  };
}

export function getSafeDelayParams(raw) {
  // Defaults are a dotted-8th echo at ~140 BPM with a gentle feedback and
  // a low send level, so enabling the delay adds space without washing
  // the track out. Feedback is hard-capped below 1: at 1 the loop would
  // never decay and the send would run away.
  const base = {
    timeMs: 320,
    feedback: 0.35,
    mix: 0.25,
    hiCutHz: 8000,
    ...(raw || {}),
  };

  return {
    timeMs: clamp(Number(base.timeMs ?? 320), 1, 2000),
    feedback: clamp(Number(base.feedback ?? 0.35), 0, 0.85),
    mix: clamp(Number(base.mix ?? 0.25), 0, 1),
    hiCutHz: clamp(Number(base.hiCutHz ?? 8000), 1200, 18000),
  };
}

export function getSafeChorusParams(raw) {
  // Defaults are a slow, gentle doubling: a 15 ms base delay wobbling by
  // up to ~1.6 ms at 0.8 Hz, blended at 35% so the dry signal stays clear.
  const base = {
    rateHz: 0.8,
    depth: 0.4,
    delayMs: 15,
    mix: 0.35,
    ...(raw || {}),
  };

  return {
    rateHz: clamp(Number(base.rateHz ?? 0.8), 0.1, 8),
    depth: clamp(Number(base.depth ?? 0.4), 0, 1),
    delayMs: clamp(Number(base.delayMs ?? 15), 5, 40),
    mix: clamp(Number(base.mix ?? 0.35), 0, 1),
  };
}

export function getSafeTransientParams(raw) {
  // Defaults are fully neutral (no shaping, full mix), so enabling the
  // shaper is transparent until attack or sustain moves off zero.
  const base = {
    attack: 0,
    sustain: 0,
    mix: 1,
    ...(raw || {}),
  };

  return {
    attack: clamp(Number(base.attack ?? 0), -1, 1),
    sustain: clamp(Number(base.sustain ?? 0), -1, 1),
    mix: clamp(Number(base.mix ?? 1), 0, 1),
  };
}

export function getChorusDepthSec(depth) {
  // Depth maps to the LFO swing on the delay time: 0 is a static delay,
  // 1 swings +/-4 ms around the base delay. The base delay never drops
  // below 5 ms, so the modulated time stays >= 1 ms (never negative).
  const safeDepth = clamp(Number(depth ?? 0.4), 0, 1);
  return safeDepth * 0.004;
}

export function getSaturationDriveGain(drive) {
  // Drive maps to the pre-shaper gain: 1x at zero drive, 21x at full
  // drive. The shaper curve itself is fixed per mode (see
  // buildSaturationCurve), so the drive node is the only thing that
  // sets how hard the signal hits the curve.
  const safeDrive = clamp(Number(drive ?? 0.3), 0, 1);
  return 1 + safeDrive * 20;
}

export function getSaturationToneHz(tone) {
  // Tone is a log tilt: 0 darkens the repeats to 2 kHz, 1 opens them to
  // 18 kHz, and the centre sits at 6 kHz. Log mapping keeps the knob
  // musical across the whole sweep.
  const safeTone = clamp(Number(tone ?? 0.5), 0, 1);
  return 2000 * Math.pow(9, safeTone);
}

export function buildSaturationCurve(mode) {
  // Fixed per-mode transfer curves; drive is applied upstream by the
  // drive gain node, not baked into the curve. Soft is a normalized
  // tanh (unity at full scale); hard clamps at +/-0.8 for a gritty,
  // clipped top. A null curve (disabled effect) passes signal unchanged.
  const samples = 4096;
  const curve = new Float32Array(samples);
  const safeMode = sanitizeSaturationMode(mode);

  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    if (safeMode === "hard") {
      curve[index] = Math.max(-0.8, Math.min(0.8, x));
    } else {
      curve[index] = Math.tanh(x) / Math.tanh(1);
    }
  }

  return curve;
}

export function buildSoftClipCurve(strength) {
  // Generates transfer curve used by maximizer soft clipping path.
  const safeStrength = clamp(Number(strength || 0), 0, 1);
  const samples = 4096;
  const curve = new Float32Array(samples);
  const drive = 1 + safeStrength * 6;

  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
  }

  return curve;
}
