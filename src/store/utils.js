import {
  FX_SLOT_EFFECT_CHORUS,
  FX_SLOT_EFFECT_COMPRESSOR,
  FX_SLOT_EFFECT_DELAY,
  FX_SLOT_EFFECT_FILTER,
  FX_SLOT_EFFECT_GRAPHIC_EQ,
  FX_SLOT_EFFECT_MAXIMIZER,
  FX_SLOT_EFFECT_NONE,
  FX_SLOT_EFFECT_REVERB,
  FX_SLOT_EFFECT_SATURATION,
  FX_SLOT_EFFECT_TRANSIENT,
  GRAPHIC_EQ_BAND_TYPES,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
  MAXIMIZER_MODES,
  UI_THEMES,
  UI_THEME_DEFAULT,
  DEFAULT_MIDI_PITCH,
  DEFAULT_NOTE_VELOCITY,
  DEFAULT_INSERT_SPECTRUM_BINS,
  MAX_PLAYLIST_BARS,
  MIN_CLIP_BAR_LENGTH,
  DEFAULT_PATTERN_COLOR,
} from "./constants";
import {
  DEFAULT_SAMPLE_SETTINGS,
  getSafeSampleSettings,
} from "../audio/domain/sampleSettings";

// ------------------------------------------------------------------
// Generic helpers
// ------------------------------------------------------------------

/**
 * Clamp a number between inclusive bounds.
 * Defined once here and imported everywhere else so we never have to
 * repeat this one-liner across the codebase again.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ------------------------------------------------------------------
// UI / Theme
// ------------------------------------------------------------------

export function sanitizeUiTheme(rawTheme) {
  const requested = String(rawTheme || "")
    .trim()
    .toLowerCase();

  if (UI_THEMES.has(requested)) {
    return requested;
  }

  return UI_THEME_DEFAULT;
}

// ------------------------------------------------------------------
// Graphic EQ helpers
// ------------------------------------------------------------------

export function getDefaultEqBandType(index) {
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

export function clampEqBandGainDb(raw) {
  const value = Number(raw || 0);
  return Math.max(-18, Math.min(18, value));
}

export function clampEqFrequencyHz(raw) {
  const value = Number(raw || 20);
  return Math.max(20, Math.min(20000, value));
}

export function clampEqQ(raw) {
  const value = Number(raw || 1.2);
  return Math.max(0.25, Math.min(8, value));
}

export function makeGraphicEqParams() {
  return {
    points: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
      function (frequencyHz, index) {
        return {
          frequencyHz,
          gainDb: 0,
          q: 1.2,
          bandType: getDefaultEqBandType(index),
        };
      },
    ),
  };
}

export function getSafeGraphicEqParams(raw) {
  const defaultParams = makeGraphicEqParams();
  const requestedPoints = Array.isArray(raw?.points) ? raw.points : [];
  const legacyBands = Array.isArray(raw?.bands) ? raw.bands : [];

  return {
    points: defaultParams.points.map(function (defaultPoint, index) {
      const requestedPoint = requestedPoints[index];
      const hasLegacyGain = index < legacyBands.length;

      return {
        frequencyHz: clampEqFrequencyHz(
          requestedPoint?.frequencyHz ?? defaultPoint.frequencyHz,
        ),
        gainDb: clampEqBandGainDb(
          requestedPoint?.gainDb ?? (hasLegacyGain ? legacyBands[index] : 0),
        ),
        q: clampEqQ(requestedPoint?.q ?? defaultPoint.q),
        bandType: sanitizeEqBandType(
          requestedPoint?.bandType,
          defaultPoint.bandType,
        ),
      };
    }),
  };
}

// ------------------------------------------------------------------
// Reverb helpers
// ------------------------------------------------------------------

export function clampReverb01(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampReverbInRange(raw, min, max, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

export function makeReverbParams() {
  return {
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
  };
}

export function getSafeReverbParams(raw) {
  const base = {
    ...makeReverbParams(),
    ...(raw || {}),
  };

  return {
    decayTime: clampReverbInRange(base.decayTime, 0.2, 20, 2.8),
    preDelayMs: clampReverbInRange(base.preDelayMs, 0, 250, 24),
    size: clampReverb01(base.size, 0.62),
    damping: clampReverb01(base.damping, 0.45),
    hiCutHz: clampReverbInRange(base.hiCutHz, 1200, 18000, 9000),
    loCutHz: clampReverbInRange(base.loCutHz, 20, 1200, 130),
    earlyReflections: clampReverb01(base.earlyReflections, 0.38),
    diffusion: clampReverb01(base.diffusion, 0.72),
    modulationDepth: clampReverb01(base.modulationDepth, 0.22),
    modulationRateHz: clampReverbInRange(base.modulationRateHz, 0, 8, 0.35),
    width: clampReverb01(base.width, 0.9),
    dryWet: clampReverb01(base.dryWet, 0.34),
    freeze: Boolean(base.freeze),
  };
}

// ------------------------------------------------------------------
// Maximizer helpers
// ------------------------------------------------------------------

export function sanitizeMaximizerMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (MAXIMIZER_MODES.includes(requested)) {
    return requested;
  }
  return "irc-ii";
}

export function clampMaximizerThresholdDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-24, Math.min(0, value));
}

export function clampMaximizerCeilingDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return -1;
  }
  return Math.max(-18, Math.min(0, value));
}

export function clampMaximizerCharacter(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

export function makeMaximizerParams() {
  return {
    mode: "irc-ii",
    truePeakEnabled: true,
    thresholdDb: 0,
    ceilingDb: -1,
    character: 0.5,
  };
}

export function getSafeMaximizerParams(raw) {
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
    ...makeMaximizerParams(),
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
    thresholdDb: clampMaximizerThresholdDb(base.thresholdDb),
    ceilingDb: clampMaximizerCeilingDb(base.ceilingDb),
    character: clampMaximizerCharacter(base.character),
  };
}

// ------------------------------------------------------------------
// Compressor helpers
// ------------------------------------------------------------------

export function clampCompressorThresholdDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return -24;
  }
  return Math.max(-60, Math.min(0, value));
}

export function clampCompressorRatio(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 4;
  }
  return Math.max(1, Math.min(20, value));
}

export function clampCompressorKneeDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 6;
  }
  return Math.max(0, Math.min(40, value));
}

export function clampCompressorAttackSec(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.01;
  }
  return Math.max(0.0005, Math.min(0.5, value));
}

export function clampCompressorReleaseSec(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.18;
  }
  return Math.max(0.01, Math.min(1, value));
}

export function clampCompressorMakeupGainDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(24, value));
}

export function clampCompressorMix(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function makeCompressorParams() {
  return {
    thresholdDb: -24,
    ratio: 4,
    kneeDb: 6,
    attackSec: 0.01,
    releaseSec: 0.18,
    makeupGainDb: 0,
    mix: 1,
  };
}

export function getSafeCompressorParams(raw) {
  const base = {
    ...makeCompressorParams(),
    ...(raw || {}),
  };

  return {
    thresholdDb: clampCompressorThresholdDb(base.thresholdDb),
    ratio: clampCompressorRatio(base.ratio),
    kneeDb: clampCompressorKneeDb(base.kneeDb),
    attackSec: clampCompressorAttackSec(base.attackSec),
    releaseSec: clampCompressorReleaseSec(base.releaseSec),
    makeupGainDb: clampCompressorMakeupGainDb(base.makeupGainDb),
    mix: clampCompressorMix(base.mix),
  };
}

// ------------------------------------------------------------------
// Saturation helpers
// ------------------------------------------------------------------

export function sanitizeSaturationMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (requested === "soft" || requested === "hard") {
    return requested;
  }
  return "soft";
}

export function clampSaturationDrive(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.3;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampSaturationTone(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampSaturationMix(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampSaturationOutputDb(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-12, Math.min(12, value));
}

export function makeSaturationParams() {
  return {
    drive: 0.3,
    mode: "soft",
    tone: 0.5,
    mix: 1,
    outputDb: 0,
  };
}

export function getSafeSaturationParams(raw) {
  const base = {
    ...makeSaturationParams(),
    ...(raw || {}),
  };

  return {
    drive: clampSaturationDrive(base.drive),
    mode: sanitizeSaturationMode(base.mode),
    tone: clampSaturationTone(base.tone),
    mix: clampSaturationMix(base.mix),
    outputDb: clampSaturationOutputDb(base.outputDb),
  };
}

// ------------------------------------------------------------------
// Filter helpers
// ------------------------------------------------------------------

export function sanitizeFilterMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (
    requested === "lowpass" ||
    requested === "highpass" ||
    requested === "bandpass" ||
    requested === "notch"
  ) {
    return requested;
  }
  return "lowpass";
}

export function clampFilterCutoffHz(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 18000;
  }
  return Math.max(20, Math.min(20000, value));
}

export function clampFilterResonance(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0.5, Math.min(20, value));
}

export function clampFilterMix(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function makeFilterParams() {
  return {
    cutoffHz: 18000,
    resonance: 1,
    mode: "lowpass",
    mix: 1,
  };
}

export function getSafeFilterParams(raw) {
  const base = {
    ...makeFilterParams(),
    ...(raw || {}),
  };

  return {
    cutoffHz: clampFilterCutoffHz(base.cutoffHz),
    resonance: clampFilterResonance(base.resonance),
    mode: sanitizeFilterMode(base.mode),
    mix: clampFilterMix(base.mix),
  };
}

// ------------------------------------------------------------------
// Delay helpers
// ------------------------------------------------------------------

export function clampDelayTimeMs(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 320;
  }
  return Math.max(1, Math.min(2000, value));
}

export function clampDelayFeedback(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.35;
  }
  // Hard cap below 1: at 1 the feedback loop would never decay.
  return Math.max(0, Math.min(0.85, value));
}

export function clampDelayMix(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.25;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampDelayHiCutHz(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 8000;
  }
  return Math.max(1200, Math.min(18000, value));
}

export function makeDelayParams() {
  return {
    timeMs: 320,
    feedback: 0.35,
    mix: 0.25,
    hiCutHz: 8000,
  };
}

export function getSafeDelayParams(raw) {
  const base = {
    ...makeDelayParams(),
    ...(raw || {}),
  };

  return {
    timeMs: clampDelayTimeMs(base.timeMs),
    feedback: clampDelayFeedback(base.feedback),
    mix: clampDelayMix(base.mix),
    hiCutHz: clampDelayHiCutHz(base.hiCutHz),
  };
}

// ------------------------------------------------------------------
// Chorus helpers
// ------------------------------------------------------------------

export function clampChorusRateHz(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.8;
  }
  return Math.max(0.1, Math.min(8, value));
}

export function clampChorusDepth(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.4;
  }
  return Math.max(0, Math.min(1, value));
}

export function clampChorusDelayMs(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 15;
  }
  return Math.max(5, Math.min(40, value));
}

export function clampChorusMix(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0.35;
  }
  return Math.max(0, Math.min(1, value));
}

export function makeChorusParams() {
  return {
    rateHz: 0.8,
    depth: 0.4,
    delayMs: 15,
    mix: 0.35,
  };
}

export function getSafeChorusParams(raw) {
  const base = {
    ...makeChorusParams(),
    ...(raw || {}),
  };

  return {
    rateHz: clampChorusRateHz(base.rateHz),
    depth: clampChorusDepth(base.depth),
    delayMs: clampChorusDelayMs(base.delayMs),
    mix: clampChorusMix(base.mix),
  };
}

// ------------------------------------------------------------------
// Transient shaper helpers
// ------------------------------------------------------------------

export function clampTransientAttack(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
}

export function clampTransientSustain(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
}

export function clampTransientMix(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function makeTransientParams() {
  return {
    attack: 0,
    sustain: 0,
    mix: 1,
  };
}

export function getSafeTransientParams(raw) {
  const base = {
    ...makeTransientParams(),
    ...(raw || {}),
  };

  return {
    attack: clampTransientAttack(base.attack),
    sustain: clampTransientSustain(base.sustain),
    mix: clampTransientMix(base.mix),
  };
}

// ------------------------------------------------------------------
// Insert / mixer helpers
// ------------------------------------------------------------------

export function makeInsertSpectrum() {
  return Array.from({ length: DEFAULT_INSERT_SPECTRUM_BINS }).map(function () {
    return 0;
  });
}

export function makeInsertWaveform() {
  return Array.from({ length: 220 }).map(function () {
    return 0;
  });
}

export function makeMaximizerStereoMeter() {
  return {
    leftVolumeDb: -96,
    leftReductionDb: 0,
    rightReductionDb: 0,
    rightVolumeDb: -96,
  };
}

export function getFxSlotDefaultName(index) {
  return "Slot " + (index + 1);
}

export function normalizeFxSlot(slot, index) {
  const rawEffectType = String(slot?.effectType || "")
    .trim()
    .toLowerCase();
  const effectType =
    rawEffectType === FX_SLOT_EFFECT_GRAPHIC_EQ
      ? FX_SLOT_EFFECT_GRAPHIC_EQ
      : rawEffectType === FX_SLOT_EFFECT_REVERB
        ? FX_SLOT_EFFECT_REVERB
        : rawEffectType === FX_SLOT_EFFECT_MAXIMIZER
          ? FX_SLOT_EFFECT_MAXIMIZER
          : rawEffectType === FX_SLOT_EFFECT_COMPRESSOR
            ? FX_SLOT_EFFECT_COMPRESSOR
            : rawEffectType === FX_SLOT_EFFECT_SATURATION
              ? FX_SLOT_EFFECT_SATURATION
              : rawEffectType === FX_SLOT_EFFECT_FILTER
                ? FX_SLOT_EFFECT_FILTER
                : rawEffectType === FX_SLOT_EFFECT_DELAY
                  ? FX_SLOT_EFFECT_DELAY
                  : rawEffectType === FX_SLOT_EFFECT_CHORUS
                    ? FX_SLOT_EFFECT_CHORUS
                    : rawEffectType === FX_SLOT_EFFECT_TRANSIENT
                      ? FX_SLOT_EFFECT_TRANSIENT
                      : FX_SLOT_EFFECT_NONE;
  const defaultName =
    effectType === FX_SLOT_EFFECT_GRAPHIC_EQ
      ? "Graphic EQ"
      : effectType === FX_SLOT_EFFECT_REVERB
        ? "Reverb"
        : effectType === FX_SLOT_EFFECT_MAXIMIZER
          ? "Limiter"
          : effectType === FX_SLOT_EFFECT_COMPRESSOR
            ? "Compressor"
            : effectType === FX_SLOT_EFFECT_SATURATION
              ? "Saturation"
              : effectType === FX_SLOT_EFFECT_FILTER
                ? "Filter"
                : effectType === FX_SLOT_EFFECT_DELAY
                  ? "Delay"
                  : effectType === FX_SLOT_EFFECT_CHORUS
                    ? "Chorus"
                    : effectType === FX_SLOT_EFFECT_TRANSIENT
                      ? "Transient Shaper"
                      : getFxSlotDefaultName(index);

  return {
    id: slot?.id || "slot-" + (index + 1),
    name: String(slot?.name || "").trim() || defaultName,
    enabled:
      effectType === FX_SLOT_EFFECT_NONE ? false : Boolean(slot?.enabled),
    effectType,
    params:
      effectType === FX_SLOT_EFFECT_GRAPHIC_EQ
        ? getSafeGraphicEqParams(slot?.params)
        : effectType === FX_SLOT_EFFECT_REVERB
          ? getSafeReverbParams(slot?.params)
          : effectType === FX_SLOT_EFFECT_MAXIMIZER
            ? getSafeMaximizerParams(slot?.params)
            : effectType === FX_SLOT_EFFECT_COMPRESSOR
              ? getSafeCompressorParams(slot?.params)
              : effectType === FX_SLOT_EFFECT_SATURATION
                ? getSafeSaturationParams(slot?.params)
                : effectType === FX_SLOT_EFFECT_FILTER
                  ? getSafeFilterParams(slot?.params)
                  : effectType === FX_SLOT_EFFECT_DELAY
                    ? getSafeDelayParams(slot?.params)
                    : effectType === FX_SLOT_EFFECT_CHORUS
                      ? getSafeChorusParams(slot?.params)
                      : effectType === FX_SLOT_EFFECT_TRANSIENT
                        ? getSafeTransientParams(slot?.params)
                        : null,
  };
}

export function ensureInsertFxSlots(insert) {
  const nextSlots = Array.from({ length: 10 }).map(function (_, index) {
    const existing = Array.isArray(insert?.fxSlots)
      ? insert.fxSlots[index]
      : null;

    if (existing) {
      return normalizeFxSlot(existing, index);
    }

    return {
      id: "slot-" + (index + 1),
      name: getFxSlotDefaultName(index),
      enabled: false,
      effectType: FX_SLOT_EFFECT_NONE,
      params: null,
    };
  });

  insert.fxSlots = nextSlots;
}

export function makeFxSlots() {
  return Array.from({ length: 10 }).map(function (_, index) {
    return {
      id: "slot-" + (index + 1),
      name: getFxSlotDefaultName(index),
      enabled: false,
      effectType: FX_SLOT_EFFECT_NONE,
      params: null,
    };
  });
}

// ------------------------------------------------------------------
// Sample / channel helpers
// ------------------------------------------------------------------

export function makeSampleSettings() {
  return { ...DEFAULT_SAMPLE_SETTINGS };
}

export function sanitizeLoadedSampleSettings(raw) {
  return getSafeSampleSettings(isObjectLike(raw) ? raw : null);
}

// ------------------------------------------------------------------
// Pattern / project helpers
// ------------------------------------------------------------------

export function nearlyEqual(a, b) {
  return Math.abs(a - b) <= 0.0001;
}

export function makeStepRow(length, activeIndexes) {
  const row = Array(length).fill(false);
  activeIndexes.forEach(function (index) {
    if (index >= 0 && index < length) {
      row[index] = true;
    }
  });
  return row;
}

export function makePlaylistTracks(count) {
  return Array.from({ length: count }).map(function (_, index) {
    const number = index + 1;
    return {
      id: "trk-" + number,
      name: "Track " + number,
    };
  });
}

export function makePatternStepGrid(channels, lengthSteps) {
  return channels.reduce(function (acc, channel) {
    acc[channel.id] = makeStepRow(lengthSteps, []);
    return acc;
  }, {});
}

export function makeChannelId() {
  return (
    "ch-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 6)
  );
}

export function makeMidiPatternNoteId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

export function normalizeBarValue(raw, minValue, maxValue) {
  const normalized = Math.round(Number(raw || 0) * 16) / 16;
  return Math.max(minValue, Math.min(maxValue, normalized));
}

export function getSafePatternColor(color) {
  const normalized = String(color || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return DEFAULT_PATTERN_COLOR;
}

export function makeEmptyPattern(options) {
  const safeLength = Math.max(
    4,
    Math.min(128, Math.round(options.lengthSteps || 16)),
  );

  return {
    id: options.id,
    name: options.name,
    color: getSafePatternColor(options.color),
    lengthSteps: safeLength,
    stepGrid: makePatternStepGrid(options.channels || [], safeLength),
    pianoPreview: {},
  };
}

export function getNextPatternNumber(patterns) {
  return (
    patterns.reduce(function (maxValue, pattern) {
      const byName = String(pattern.name || "").match(/pattern\s+(\d+)/i);
      const byId = String(pattern.id || "").match(/pat-(\d+)/i);
      const parsedByName = byName ? Number(byName[1]) : 0;
      const parsedById = byId ? Number(byId[1]) : 0;
      return Math.max(maxValue, parsedByName, parsedById);
    }, 0) + 1
  );
}

export function clonePatternForCopy(sourcePattern, nextId, nextName) {
  const safeLength = Math.max(
    4,
    Math.min(128, Math.round(Number(sourcePattern.lengthSteps || 16))),
  );

  const clonedStepGrid = Object.entries(sourcePattern.stepGrid || {}).reduce(
    function (acc, entry) {
      const channelId = entry[0];
      const row = entry[1];
      const safeRow = Array.isArray(row) ? row.slice(0, safeLength) : [];

      if (safeRow.length < safeLength) {
        safeRow.push(...Array(safeLength - safeRow.length).fill(false));
      }

      acc[channelId] = safeRow.map(Boolean);
      return acc;
    },
    {},
  );

  const clonedPianoPreview = Object.entries(
    sourcePattern.pianoPreview || {},
  ).reduce(function (acc, entry) {
    const channelId = entry[0];
    const notes = entry[1];

    acc[channelId] = (notes || []).map(function (note) {
      return {
        ...note,
        start: Math.max(
          0,
          Math.min(safeLength - 0.0625, Number(note.start || 0)),
        ),
        length: Math.max(0.0625, Number(note.length || 1)),
        velocity: Math.max(
          1,
          Math.min(
            127,
            Math.round(Number(note.velocity || DEFAULT_NOTE_VELOCITY)),
          ),
        ),
      };
    });

    return acc;
  }, {});

  return {
    id: nextId,
    name: String(nextName || sourcePattern.name || "Pattern").slice(0, 40),
    color: getSafePatternColor(sourcePattern.color),
    lengthSteps: safeLength,
    stepGrid: clonedStepGrid,
    pianoPreview: clonedPianoPreview,
  };
}

// ------------------------------------------------------------------
// Serialization / loading helpers
// ------------------------------------------------------------------

export function isObjectLike(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cloneSerializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Note: sanitizeLoadedDawState was extracted to loadState.js to avoid a
// circular dependency between utils -> initialState -> utils.
// ------------------------------------------------------------------
