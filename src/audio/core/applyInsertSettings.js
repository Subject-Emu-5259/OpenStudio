import { getActiveFxState } from "./getActiveFxState";
import {
  buildSaturationCurve,
  buildSoftClipCurve,
  getChorusDepthSec,
  getDefaultEqBandType,
  getSaturationDriveGain,
  getSaturationToneHz,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
  sanitizeEqBandType,
  sanitizeFilterMode,
  sanitizeMaximizerMode,
} from "../domain/fxParams";
import { clamp } from "../../store/utils";

const MAX_DYNAMICS_COMPRESSOR_RATIO = 20;

/**
 * Applies all mixer-insert parameters (pan, stereo width, EQ, compressor,
 * saturation, filter, transient, reverb, delay, chorus, maximizer) to a
 * previously created insert node graph.
 *
 * The insert chain is SERIAL (panner -> EQ -> compressor -> saturation ->
 * filter -> transient -> maximizer), so stages that are off go neutral instead of gating
 * the chain: a zero gain anywhere in series would silence the whole insert.
 * The dry gain carries the chain output and the wet gain carries the send
 * returns (reverb, delay, chorus); when reverb runs alone its dryWet acts
 * as a balance, and when insert effects are also on it acts as the reverb
 * send level instead. Delay and chorus are pure additions — their mix sets
 * the send level and they never reduce the dry signal.
 *
 * The transient stage is an AudioWorkletNode whose attack/sustain are
 * AudioParams; when the worklet module has not loaded yet for this
 * context the stage runs a unity-gain fallback node (no parameters map)
 * and the mix still blends dry/wet — the fallback passes signal
 * unchanged, so the stage is a transparent bypass until the upgrade
 * path swaps the real node in.
 *
 * This single implementation is shared between the real-time scheduler and the
 * offline exporter.  The only behavioural difference is how parameter changes
 * are scheduled: the offline path uses immediate `setValueAtTime` calls at
 * time 0, whereas the real-time path optionally smooths gain changes with short
 * linear ramps to avoid clicks when the user moves a fader or toggles an FX.
 *
 * @param {object} node – insert node graph produced by createMixerInsertNodes.
 * @param {object} insert – mixer insert descriptor from project state.
 * @param {number} atTime – audio-context time at which values should be set.
 * @param {object} [options]
 * @param {boolean} [options.useSmoothing=false] – when true, gain-parameter
 *   changes are ramped over `paramRampSec` instead of stepped.
 * @param {number} [options.paramRampSec=0.018] – duration of the smoothing
 *   ramp for generic gain parameters.
 * @param {number} [options.outputGainRampSec=0.01] – duration of the smoothing
 *   ramp specifically for the output fader (shorter, feels more responsive).
 */
export function applyInsertSettings(
  node,
  insert,
  atTime,
  options = {},
) {
  const {
    useSmoothing = false,
    paramRampSec = 0.018,
    outputGainRampSec = 0.01,
  } = options;

  /**
   * Schedules a value on an AudioParam.  When smoothing is requested we
   * cancel existing automation, snapshot the current value, and ramp to the
   * target.  This avoids discontinuities in the real-time path while keeping
   * the offline path deterministic and free of unnecessary ramps.
   */
  const smoothTo = useSmoothing
    ? function smoothTo(param, targetValue, time) {
        param.cancelScheduledValues(time);
        param.setValueAtTime(param.value, time);
        param.linearRampToValueAtTime(targetValue, time + paramRampSec);
      }
    : function setImmediately(param, targetValue, time) {
        param.setValueAtTime(targetValue, time);
      };

  const targetFader = insert.active
    ? Math.max(0, Math.min(1.25, Number(insert.fader ?? 1)))
    : 0;
  const targetPan = Math.max(-1, Math.min(1, Number(insert.pan || 0)));
  const targetSeparation = Math.max(
    -1,
    Math.min(1, Number(insert.stereoSeparation || 0)),
  );

  const activeFx = getActiveFxState(insert);
  const eqEnabled = activeFx.eqEnabled;
  const reverbEnabled = activeFx.reverbEnabled;
  const maximizerEnabled = activeFx.maximizerEnabled;
  const compressorEnabled = activeFx.compressorEnabled;
  const saturationEnabled = activeFx.saturationEnabled;
  const filterEnabled = activeFx.filterEnabled;
  const delayEnabled = activeFx.delayEnabled;
  const chorusEnabled = activeFx.chorusEnabled;
  const transientEnabled = activeFx.transientEnabled;
  const eqParams = activeFx.eqParams;
  const reverbParams = activeFx.reverbParams;
  const maximizerParams = activeFx.maximizerParams;
  const compressorParams = activeFx.compressorParams;
  const saturationParams = activeFx.saturationParams;
  const filterParams = activeFx.filterParams;
  const delayParams = activeFx.delayParams;
  const chorusParams = activeFx.chorusParams;
  const transientParams = activeFx.transientParams;
  const hasInsertFx =
    eqEnabled ||
    compressorEnabled ||
    saturationEnabled ||
    filterEnabled ||
    transientEnabled ||
    maximizerEnabled;

  // ---- stereo width matrix ------------------------------------------------
  const width = 1 - targetSeparation;
  const directGain = 0.5 * (1 + width);
  const crossGain = 0.5 * (1 - width);

  node.leftToLeft.gain.setValueAtTime(directGain, atTime);
  node.rightToRight.gain.setValueAtTime(directGain, atTime);
  node.rightToLeft.gain.setValueAtTime(crossGain, atTime);
  node.leftToRight.gain.setValueAtTime(crossGain, atTime);
  node.panner.pan.setValueAtTime(targetPan, atTime);

  // ---- dry/wet routing ----------------------------------------------------
  // The dry gain carries the serial chain output and the wet gain carries
  // the send returns (reverb, delay, chorus). With insert effects on, the
  // chain always passes at full level and the sends are additions (their
  // levels set by dryWet / mix below); with reverb alone, dryWet balances
  // chain against reverb instead. Delay and chorus never touch the dry
  // signal — they only open the shared wet bus.
  const dryMix =
    reverbEnabled && !hasInsertFx
      ? clamp(1 - reverbParams.dryWet, 0, 1)
      : 1;
  const wetMix = reverbEnabled || delayEnabled || chorusEnabled ? 1 : 0;

  smoothTo(node.fxDryGain.gain, dryMix, atTime);
  smoothTo(node.fxWetGain.gain, wetMix, atTime);
  // The chain entry always passes: in a serial chain a zero gain here
  // would silence every downstream stage.  A disabled EQ goes flat
  // (0 dB bands) instead of gating.
  smoothTo(node.eqInput.gain, 1, atTime);
  node.eqLowCut.frequency.setValueAtTime(20, atTime);
  node.eqLowCut.Q.setValueAtTime(0.707, atTime);

  // ---- graphic EQ ---------------------------------------------------------
  if (Array.isArray(node.eqBands)) {
    node.eqBands.forEach(function (bandNode, index) {
      const point = eqParams.points[index] || {
        frequencyHz: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES[index],
        gainDb: 0,
        q: 1.2,
        bandType: getDefaultEqBandType(index),
      };
      bandNode.type = sanitizeEqBandType(
        point.bandType,
        getDefaultEqBandType(index),
      );
      bandNode.frequency.setValueAtTime(point.frequencyHz, atTime);
      bandNode.Q.setValueAtTime(point.q, atTime);
      smoothTo(bandNode.gain, eqEnabled ? point.gainDb : 0, atTime);
    });
  }

  // ---- compressor parameters ----------------------------------------------
  // A disabled compressor goes fully dry (mix 0) and neutral (1:1 ratio,
  // 0 dB threshold) so the chain passes untouched and the GR meter reads
  // zero.  Makeup gain only lifts the wet path — the dry path bypasses it.
  const compThresholdDb = compressorEnabled
    ? clamp(compressorParams.thresholdDb, -60, 0)
    : 0;
  const compRatio = compressorEnabled
    ? clamp(compressorParams.ratio, 1, 20)
    : 1;
  const compKneeDb = compressorEnabled
    ? clamp(compressorParams.kneeDb, 0, 40)
    : 0;
  const compAttackSec = clamp(compressorParams.attackSec, 0.0005, 0.5);
  const compReleaseSec = clamp(compressorParams.releaseSec, 0.01, 1);
  const compMakeupDb = compressorEnabled
    ? clamp(compressorParams.makeupGainDb, 0, 24)
    : 0;
  const compMix = compressorEnabled
    ? clamp(compressorParams.mix, 0, 1)
    : 0;

  smoothTo(node.compressorInput.gain, 1, atTime);
  node.compressor.threshold.setValueAtTime(compThresholdDb, atTime);
  node.compressor.ratio.setValueAtTime(compRatio, atTime);
  node.compressor.knee.setValueAtTime(compKneeDb, atTime);
  node.compressor.attack.setValueAtTime(compAttackSec, atTime);
  node.compressor.release.setValueAtTime(compReleaseSec, atTime);
  smoothTo(
    node.compressorMakeupGain.gain,
    Math.pow(10, compMakeupDb / 20),
    atTime,
  );
  smoothTo(node.compressorDryGain.gain, 1 - compMix, atTime);
  smoothTo(node.compressorWetGain.gain, compMix, atTime);

  // ---- saturation parameters ----------------------------------------------
  // A disabled saturation goes fully dry (mix 0) with unity drive, a null
  // shaper curve (a WaveShaper with no curve passes signal unchanged), a
  // wide-open tone filter and unity output, so the chain passes untouched.
  const satDriveGain = saturationEnabled
    ? getSaturationDriveGain(saturationParams.drive)
    : 1;
  const satToneHz = saturationEnabled
    ? getSaturationToneHz(saturationParams.tone)
    : 18000;
  const satOutputDb = saturationEnabled
    ? clamp(saturationParams.outputDb, -12, 12)
    : 0;
  const satMix = saturationEnabled
    ? clamp(saturationParams.mix, 0, 1)
    : 0;

  smoothTo(node.saturationInput.gain, 1, atTime);
  smoothTo(node.saturationDrive.gain, satDriveGain, atTime);
  node.saturationShaper.curve = saturationEnabled
    ? buildSaturationCurve(saturationParams.mode)
    : null;
  // 4x oversampling keeps the harmonics the shaper adds from folding back
  // as aliasing, the same as the maximizer's soft-clip path.
  node.saturationShaper.oversample = "4x";
  node.saturationTone.type = "lowpass";
  node.saturationTone.frequency.setValueAtTime(satToneHz, atTime);
  node.saturationTone.Q.setValueAtTime(0.707, atTime);
  smoothTo(
    node.saturationOutputGain.gain,
    Math.pow(10, satOutputDb / 20),
    atTime,
  );
  smoothTo(node.saturationDryGain.gain, 1 - satMix, atTime);
  smoothTo(node.saturationWetGain.gain, satMix, atTime);

  // ---- filter parameters --------------------------------------------------
  // A disabled filter goes fully dry (mix 0) so the biquad is out of the
  // signal path entirely; its stored params stay as-is (inaudible at
  // mix 0, and they re-apply the moment the filter is re-enabled).
  const filterMix = filterEnabled
    ? clamp(filterParams.mix, 0, 1)
    : 0;

  smoothTo(node.filterInput.gain, 1, atTime);
  node.filterBiquad.type = sanitizeFilterMode(filterParams.mode);
  node.filterBiquad.frequency.setValueAtTime(
    clamp(filterParams.cutoffHz, 20, 20000),
    atTime,
  );
  node.filterBiquad.Q.setValueAtTime(
    clamp(filterParams.resonance, 0.5, 20),
    atTime,
  );
  smoothTo(node.filterDryGain.gain, 1 - filterMix, atTime);
  smoothTo(node.filterWetGain.gain, filterMix, atTime);

  // ---- transient parameters -----------------------------------------------
  // A disabled transient shaper goes fully dry (mix 0) so the worklet is
  // out of the signal path entirely; its stored params stay as-is
  // (inaudible at mix 0, and they re-apply the moment the shaper is
  // re-enabled). When the stage runs the unity-gain fallback node (no
  // parameters map — the worklet module has not loaded yet), the param
  // writes are skipped and the mix still blends dry/wet; the fallback
  // passes signal unchanged, so mix is inaudible until the upgrade path
  // swaps the real node in.
  const transientMix = transientEnabled
    ? clamp(transientParams.mix, 0, 1)
    : 0;

  smoothTo(node.transientInput.gain, 1, atTime);
  if (node.transientNode && node.transientNode.parameters) {
    node.transientNode.parameters
      .get("attack")
      .setValueAtTime(clamp(transientParams.attack, -1, 1), atTime);
    node.transientNode.parameters
      .get("sustain")
      .setValueAtTime(clamp(transientParams.sustain, -1, 1), atTime);
  }
  smoothTo(node.transientDryGain.gain, 1 - transientMix, atTime);
  smoothTo(node.transientWetGain.gain, transientMix, atTime);

  // ---- reverb parameters --------------------------------------------------
  const reverbSize = reverbEnabled ? clamp(reverbParams.size, 0, 1) : 0.62;
  const reverbDiffusion = reverbEnabled
    ? clamp(reverbParams.diffusion, 0, 1)
    : 0.72;
  const reverbDamping = reverbEnabled
    ? clamp(reverbParams.damping, 0, 1)
    : 0.45;
  const reverbDecay = reverbEnabled
    ? clamp(reverbParams.decayTime, 0.2, 20)
    : 2.8;
  const isFreeze = reverbEnabled && Boolean(reverbParams.freeze);

  const preDelaySec =
    (reverbEnabled ? clamp(reverbParams.preDelayMs, 0, 250) : 24) / 1000;
  const hiCutHz = reverbEnabled
    ? clamp(reverbParams.hiCutHz, 1200, 18000)
    : 9000;
  const loCutHz = reverbEnabled
    ? clamp(reverbParams.loCutHz, 20, 1200)
    : 130;
  const earlyMix = reverbEnabled
    ? clamp(reverbParams.earlyReflections, 0, 1)
    : 0.38;
  const widthValue = reverbEnabled ? clamp(reverbParams.width, 0, 1) : 0.9;
  const modDepth = reverbEnabled
    ? clamp(reverbParams.modulationDepth, 0, 1)
    : 0.22;
  const modRate = reverbEnabled
    ? clamp(reverbParams.modulationRateHz, 0, 8)
    : 0.35;

  const leftBaseDelay =
    0.029 + reverbSize * 0.053 + reverbDiffusion * 0.011;
  const rightBaseDelay =
    0.037 + reverbSize * 0.061 + reverbDiffusion * 0.013;
  const feedbackBase = isFreeze
    ? 0.988
    : clamp(
        0.24 + reverbDecay / 34 + reverbSize * 0.14 + reverbDiffusion * 0.1,
        0.2,
        0.82,
      );
  const earlyLevel = isFreeze ? 0 : earlyMix;
  const reverbInputLevel = reverbEnabled ? (isFreeze ? 0 : 1) : 0;
  const dampFreq = Math.max(900, hiCutHz * (1 - reverbDamping * 0.55));
  const directWidth = 0.5 * (1 + widthValue);
  const crossWidth = 0.5 * (1 - widthValue);

  smoothTo(node.reverbInput.gain, reverbInputLevel, atTime);
  node.reverbPreDelay.delayTime.setValueAtTime(preDelaySec, atTime);
  node.reverbLoCut.frequency.setValueAtTime(loCutHz, atTime);
  node.reverbLoCut.Q.setValueAtTime(0.707, atTime);
  node.reverbHiCut.frequency.setValueAtTime(hiCutHz, atTime);
  node.reverbHiCut.Q.setValueAtTime(0.62, atTime);

  node.reverbLateLeftDelay.delayTime.setValueAtTime(leftBaseDelay, atTime);
  node.reverbLateRightDelay.delayTime.setValueAtTime(rightBaseDelay, atTime);
  smoothTo(node.reverbLeftFeedback.gain, feedbackBase, atTime);
  smoothTo(node.reverbRightFeedback.gain, feedbackBase * 0.985, atTime);
  node.reverbLeftDamping.frequency.setValueAtTime(dampFreq, atTime);
  node.reverbRightDamping.frequency.setValueAtTime(dampFreq * 0.96, atTime);
  node.reverbLeftDamping.Q.setValueAtTime(0.68, atTime);
  node.reverbRightDamping.Q.setValueAtTime(0.68, atTime);
  node.reverbEarlyGain.gain.setValueAtTime(earlyLevel, atTime);

  if (Array.isArray(node.reverbEarlyTaps)) {
    node.reverbEarlyTaps.forEach(function (tap, tapIndex) {
      const spread = reverbSize * 0.018 + reverbDiffusion * 0.011;
      const base = Number(tap.baseTime || 0.012);
      tap.delay.delayTime.setValueAtTime(base + spread, atTime);
      const tapBaseGain = [0.5, 0.36, 0.26, 0.2][tapIndex] || 0.2;
      tap.gain.gain.setValueAtTime(tapBaseGain * earlyLevel, atTime);
    });
  }

  node.reverbLeftToLeft.gain.setValueAtTime(directWidth, atTime);
  node.reverbRightToRight.gain.setValueAtTime(directWidth, atTime);
  node.reverbRightToLeft.gain.setValueAtTime(crossWidth, atTime);
  node.reverbLeftToRight.gain.setValueAtTime(crossWidth, atTime);

  smoothTo(
    node.reverbWetGain.gain,
    reverbEnabled
      ? hasInsertFx
        ? clamp(reverbParams.dryWet, 0, 1)
        : 1
      : 0,
    atTime,
  );

  if (Array.isArray(node.reverbModulators)) {
    node.reverbModulators.forEach(function (modNode, index) {
      modNode.lfo.frequency.setValueAtTime(
        modRate * (index === 0 ? 1 : 1.17),
        atTime,
      );
      modNode.depth.gain.setValueAtTime(
        (0.0004 + modDepth * 0.0032) * (index === 0 ? 1 : -1),
        atTime,
      );
    });
  }

  // ---- delay parameters ---------------------------------------------------
  // A disabled delay gates its input and kills its feedback so the loop
  // stops circulating; the stored time and damping stay as-is (inaudible
  // at mix 0, and they re-apply the moment the delay is re-enabled).
  // Feedback is hard-capped below 1 here as well as in the sanitizer —
  // a runaway loop must be impossible no matter where the value came from.
  const delayTimeSec = clamp(delayParams.timeMs, 1, 2000) / 1000;
  const delayFeedbackGain = delayEnabled
    ? clamp(delayParams.feedback, 0, 0.85)
    : 0;
  const delayMix = delayEnabled
    ? clamp(delayParams.mix, 0, 1)
    : 0;

  smoothTo(node.delayInput.gain, delayEnabled ? 1 : 0, atTime);
  node.delayNode.delayTime.setValueAtTime(delayTimeSec, atTime);
  node.delayDamping.type = "lowpass";
  node.delayDamping.frequency.setValueAtTime(
    clamp(delayParams.hiCutHz, 1200, 18000),
    atTime,
  );
  node.delayDamping.Q.setValueAtTime(0.707, atTime);
  smoothTo(node.delayFeedback.gain, delayFeedbackGain, atTime);
  smoothTo(node.delayWetGain.gain, delayMix, atTime);

  // ---- chorus parameters --------------------------------------------------
  // A disabled chorus gates its input and flattens its LFO depth so the
  // delay time sits still at the base value; the wet gain goes to 0 so
  // the (still-running) LFO is inaudible until the chorus is re-enabled.
  const chorusDelaySec = clamp(chorusParams.delayMs, 5, 40) / 1000;
  const chorusRateHz = clamp(chorusParams.rateHz, 0.1, 8);
  const chorusDepthSec = chorusEnabled
    ? getChorusDepthSec(chorusParams.depth)
    : 0;
  const chorusMix = chorusEnabled
    ? clamp(chorusParams.mix, 0, 1)
    : 0;

  smoothTo(node.chorusInput.gain, chorusEnabled ? 1 : 0, atTime);
  node.chorusDelay.delayTime.setValueAtTime(chorusDelaySec, atTime);
  smoothTo(node.chorusWetGain.gain, chorusMix, atTime);

  if (Array.isArray(node.chorusModulators)) {
    node.chorusModulators.forEach(function (modNode) {
      modNode.lfo.frequency.setValueAtTime(chorusRateHz, atTime);
      modNode.depth.gain.setValueAtTime(chorusDepthSec, atTime);
    });
  }

  // ---- maximizer parameters -----------------------------------------------
  const mode = sanitizeMaximizerMode(maximizerParams.mode);
  const modeConfigById = {
    "irc-ll": {
      ratio: 12,
      knee: 1.2,
      attackFast: 0.0015,
      attackSlow: 0.006,
      releaseFast: 0.04,
      releaseSlow: 0.16,
    },
    "irc-i": {
      ratio: 16,
      knee: 1.8,
      attackFast: 0.001,
      attackSlow: 0.005,
      releaseFast: 0.05,
      releaseSlow: 0.2,
    },
    "irc-ii": {
      ratio: 18,
      knee: 2.3,
      attackFast: 0.0006,
      attackSlow: 0.004,
      releaseFast: 0.06,
      releaseSlow: 0.24,
    },
    "irc-iii": {
      ratio: 24,
      knee: 3.1,
      attackFast: 0.0008,
      attackSlow: 0.0045,
      releaseFast: 0.07,
      releaseSlow: 0.28,
    },
    "irc-iv": {
      ratio: 28,
      knee: 4.2,
      attackFast: 0.0012,
      attackSlow: 0.006,
      releaseFast: 0.08,
      releaseSlow: 0.32,
    },
  };
  const modeConfig = modeConfigById[mode] || modeConfigById["irc-ii"];
  const thresholdDb = clamp(maximizerParams.thresholdDb, -24, 0);
  const ceilingDb = clamp(maximizerParams.ceilingDb, -18, 0);
  const character = clamp(maximizerParams.character, 0, 1);
  const truePeakEnabled = Boolean(maximizerParams.truePeakEnabled);
  const driveDb = Math.max(0, -thresholdDb);
  const preGainDb = driveDb;
  const compressorThresholdDb = -0.8;
  const truePeakHeadroomDb = truePeakEnabled ? 0.3 : 0;
  const ceilingGain = Math.pow(
    10,
    (ceilingDb - truePeakHeadroomDb) / 20,
  );
  const attackSec =
    modeConfig.attackFast +
    character * (modeConfig.attackSlow - modeConfig.attackFast);
  const releaseSec =
    modeConfig.releaseFast +
    character * (modeConfig.releaseSlow - modeConfig.releaseFast);
  const kneeDb = modeConfig.knee + character * 1.6;
  const ratio = clamp(
    modeConfig.ratio + (1 - character) * 6,
    1,
    MAX_DYNAMICS_COMPRESSOR_RATIO,
  );
  const clipStrength = clamp(
    (driveDb / 24) * (0.06 + (1 - character) * 0.12),
    0,
    0.18,
  );

  // The maximizer entry always passes (serial chain); a disabled maximizer
  // goes neutral — unity pre/ceiling gain, no soft clip, and a 1:1
  // compressor — instead of gating the chain.
  smoothTo(node.maximizerInput.gain, 1, atTime);
  smoothTo(
    node.maximizerPreGain.gain,
    maximizerEnabled ? Math.pow(10, preGainDb / 20) : 1,
    atTime,
  );
  node.maximizerCompressor.threshold.setValueAtTime(
    maximizerEnabled ? compressorThresholdDb : 0,
    atTime,
  );
  node.maximizerCompressor.ratio.setValueAtTime(
    maximizerEnabled ? ratio : 1,
    atTime,
  );
  node.maximizerCompressor.knee.setValueAtTime(
    maximizerEnabled ? kneeDb : 0,
    atTime,
  );
  node.maximizerCompressor.attack.setValueAtTime(attackSec, atTime);
  node.maximizerCompressor.release.setValueAtTime(releaseSec, atTime);
  node.maximizerSoftClip.curve =
    maximizerEnabled && clipStrength > 0.001
      ? buildSoftClipCurve(clipStrength)
      : null;
  node.maximizerSoftClip.oversample = truePeakEnabled ? "4x" : "2x";
  smoothTo(
    node.maximizerCeilingGain.gain,
    maximizerEnabled ? ceilingGain : 1,
    atTime,
  );

  // ---- output fader -------------------------------------------------------
  // The output fader gets its own smoothing logic because in the real-time
  // path we want an extra-short ramp (10 ms) that snaps to the current
  // value before ramping, giving an immediate but click-free response.
  if (useSmoothing) {
    node.outputGain.gain.cancelScheduledValues(atTime);
    node.outputGain.gain.setValueAtTime(
      node.outputGain.gain.value,
      atTime,
    );
    node.outputGain.gain.linearRampToValueAtTime(
      targetFader,
      atTime + outputGainRampSec,
    );
  } else {
    node.outputGain.gain.setValueAtTime(targetFader, atTime);
  }
}
