import {
  FX_EFFECT_CHORUS,
  FX_EFFECT_COMPRESSOR,
  FX_EFFECT_DELAY,
  FX_EFFECT_FILTER,
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  FX_EFFECT_SATURATION,
  FX_EFFECT_TRANSIENT,
  getSafeChorusParams,
  getSafeCompressorParams,
  getSafeDelayParams,
  getSafeFilterParams,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
  getSafeSaturationParams,
  getSafeTransientParams,
} from "../domain/fxParams";

/**
 * Resolves enabled insert effects into a compact, sanitized snapshot.
 *
 * This is used by both the real-time scheduler and the offline exporter so
 * that both paths see the same normalized effect state and default values.
 *
 * @param {object} insert – mixer insert descriptor (may contain fxSlots).
 * @returns {{eqEnabled:boolean,eqParams:object,reverbEnabled:boolean,reverbParams:object,maximizerEnabled:boolean,maximizerParams:object,compressorEnabled:boolean,compressorParams:object,saturationEnabled:boolean,saturationParams:object,filterEnabled:boolean,filterParams:object,delayEnabled:boolean,delayParams:object,chorusEnabled:boolean,chorusParams:object,transientEnabled:boolean,transientParams:object}}
 */
export function getActiveFxState(insert) {
  const fxSlots = Array.isArray(insert?.fxSlots) ? insert.fxSlots : [];
  const state = {
    eqEnabled: false,
    eqParams: getSafeGraphicEqParams(null),
    reverbEnabled: false,
    reverbParams: getSafeReverbParams(null),
    maximizerEnabled: false,
    maximizerParams: getSafeMaximizerParams(null),
    compressorEnabled: false,
    compressorParams: getSafeCompressorParams(null),
    saturationEnabled: false,
    saturationParams: getSafeSaturationParams(null),
    filterEnabled: false,
    filterParams: getSafeFilterParams(null),
    delayEnabled: false,
    delayParams: getSafeDelayParams(null),
    chorusEnabled: false,
    chorusParams: getSafeChorusParams(null),
    transientEnabled: false,
    transientParams: getSafeTransientParams(null),
  };

  fxSlots.forEach(function (slot) {
    if (!slot?.enabled) {
      return;
    }

    const effectType = String(slot.effectType || "none");
    if (effectType === FX_EFFECT_GRAPHIC_EQ) {
      state.eqEnabled = true;
      state.eqParams = getSafeGraphicEqParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_REVERB) {
      state.reverbEnabled = true;
      state.reverbParams = getSafeReverbParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_MAXIMIZER) {
      state.maximizerEnabled = true;
      state.maximizerParams = getSafeMaximizerParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_COMPRESSOR) {
      state.compressorEnabled = true;
      state.compressorParams = getSafeCompressorParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_SATURATION) {
      state.saturationEnabled = true;
      state.saturationParams = getSafeSaturationParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_FILTER) {
      state.filterEnabled = true;
      state.filterParams = getSafeFilterParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_DELAY) {
      state.delayEnabled = true;
      state.delayParams = getSafeDelayParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_CHORUS) {
      state.chorusEnabled = true;
      state.chorusParams = getSafeChorusParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_TRANSIENT) {
      state.transientEnabled = true;
      state.transientParams = getSafeTransientParams(slot.params);
    }
  });

  return state;
}
