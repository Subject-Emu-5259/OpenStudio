import {
  getDefaultEqBandType,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
} from "../domain/fxParams";
import {
  createTransientShaperNode,
  isTransientShaperWorkletReady,
} from "./transientShaperWorklet";

/**
 * Builds a complete mixer-insert audio graph for every insert in the supplied
 * mixer-settings array.  Each insert receives its own DSP chain:
 *
 *   inputGain → splitter → stereo-width matrix → panner
 *     → EQ → compressor → saturation → filter → transient → maximizer
 *     → fxDryGain ─┐
 *                  ├→ outputGain → [analyser]
 *   chain tail ─→ reverb send → reverbWetGain ─┐
 *   chain tail ─→ delay send → delayWetGain ───┤→ fxWetGain ─┘
 *   chain tail ─→ chorus send → chorusWetGain ─┘
 *
 * Insert effects run in SERIES: every stage passes signal to the next, so
 * the compressor hears the EQ'd signal and the maximizer hears the
 * compressed signal.  Stages that are off go neutral (flat EQ, 1:1
 * compressor, unity maximizer) instead of gating the chain — a zero gain
 * anywhere in series would silence the whole insert.  Reverb, delay and
 * chorus are parallel sends tapped post-chain, so they hear the fully
 * processed sound and never reduce the dry signal.
 *
 * The transient stage is an AudioWorkletNode, and worklet modules load
 * asynchronously — so a graph built before the module registers for this
 * context gets a unity-gain fallback node in the transient stage instead.
 * The fallback passes signal unchanged (the stage is a transparent
 * bypass until the real node lands) and useMixerGraph upgrades fallback
 * nodes in place once the module loads (see
 * upgradeTransientWorkletNodes).  The descriptor's transientWorkletReady
 * flag says which one a given insert is running.
 *
 * The graph is returned as a Map keyed by insert id.  Callers are responsible
 * for wiring inter-insert routes (master/aux sends) and for applying parameter
 * values (see applyInsertSettings).
 *
 * @param {BaseAudioContext} audioCtx – online or offline audio context.
 * @param {object[]} mixerInserts – array of insert descriptors.
 * @param {object} [options]
 * @param {boolean} [options.includeAnalysers=false] – when true, extra
 *   AnalyserNodes are inserted around the maximizer and at the insert output
 *   so the UI can read meters, spectrum and waveform data in real time.
 * @returns {{insertMap:Map<string,object>,getOutputNode:function}}
 */
export function createMixerInsertNodes(audioCtx, mixerInserts, options = {}) {
  const { includeAnalysers = false } = options;
  const inserts = Array.isArray(mixerInserts) ? mixerInserts : [];
  const insertMap = new Map();

  inserts.forEach(function (insert) {
    const inputGain = audioCtx.createGain();
    const splitter = audioCtx.createChannelSplitter(2);
    const leftToLeft = audioCtx.createGain();
    const rightToLeft = audioCtx.createGain();
    const leftToRight = audioCtx.createGain();
    const rightToRight = audioCtx.createGain();
    const merger = audioCtx.createChannelMerger(2);
    const panner = audioCtx.createStereoPanner();
    const fxDryGain = audioCtx.createGain();
    const fxWetGain = audioCtx.createGain();
    const eqInput = audioCtx.createGain();
    const eqLowCut = audioCtx.createBiquadFilter();
    const eqBands = GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
      function (frequencyHz, index) {
        const band = audioCtx.createBiquadFilter();
        band.type = getDefaultEqBandType(index);
        band.frequency.value = frequencyHz;
        band.Q.value = 1.08;
        band.gain.value = 0;
        return band;
      },
    );
    const compressorInput = audioCtx.createGain();
    const compressor = audioCtx.createDynamicsCompressor();
    const compressorMakeupGain = audioCtx.createGain();
    const compressorDryGain = audioCtx.createGain();
    const compressorWetGain = audioCtx.createGain();
    const compressorOutput = audioCtx.createGain();
    // Saturation: pre-gain drive into a fixed per-mode shaper curve, then
    // a tone lowpass and an output trim, with dry/wet parallel blending.
    const saturationInput = audioCtx.createGain();
    const saturationDryGain = audioCtx.createGain();
    const saturationDrive = audioCtx.createGain();
    const saturationShaper = audioCtx.createWaveShaper();
    const saturationTone = audioCtx.createBiquadFilter();
    const saturationOutputGain = audioCtx.createGain();
    const saturationWetGain = audioCtx.createGain();
    const saturationOutput = audioCtx.createGain();
    // Filter: one sweepable biquad with dry/wet parallel blending.
    const filterInput = audioCtx.createGain();
    const filterDryGain = audioCtx.createGain();
    const filterBiquad = audioCtx.createBiquadFilter();
    const filterWetGain = audioCtx.createGain();
    const filterOutput = audioCtx.createGain();
    // Transient: an AudioWorklet envelope-follower shaper with dry/wet
    // parallel blending. The worklet module loads asynchronously, so
    // when it is not registered yet for this context the stage runs a
    // unity-gain fallback node instead (identical wiring — the fallback
    // passes signal unchanged, so the stage is a transparent bypass
    // until upgradeTransientWorkletNodes swaps the real node in).
    const transientInput = audioCtx.createGain();
    const transientDryGain = audioCtx.createGain();
    const transientNode =
      createTransientShaperNode(audioCtx) || audioCtx.createGain();
    const transientWorkletReady = isTransientShaperWorkletReady(audioCtx);
    const transientWetGain = audioCtx.createGain();
    const transientOutput = audioCtx.createGain();
    const reverbInput = audioCtx.createGain();
    const reverbPreDelay = audioCtx.createDelay(0.5);
    const reverbLoCut = audioCtx.createBiquadFilter();
    const reverbHiCut = audioCtx.createBiquadFilter();
    const reverbEarlyGain = audioCtx.createGain();
    const reverbLateInput = audioCtx.createGain();
    const reverbLateLeftDelay = audioCtx.createDelay(1.25);
    const reverbLateRightDelay = audioCtx.createDelay(1.25);
    const reverbLeftFeedback = audioCtx.createGain();
    const reverbRightFeedback = audioCtx.createGain();
    const reverbLeftDamping = audioCtx.createBiquadFilter();
    const reverbRightDamping = audioCtx.createBiquadFilter();
    const reverbLeftToLeft = audioCtx.createGain();
    const reverbRightToLeft = audioCtx.createGain();
    const reverbLeftToRight = audioCtx.createGain();
    const reverbRightToRight = audioCtx.createGain();
    const reverbWidthMerger = audioCtx.createChannelMerger(2);
    const reverbWetGain = audioCtx.createGain();
    // Delay: a single echo line with a damping filter inside the feedback
    // loop, so each repeat darkens (dub-style). The loop is a legal cycle
    // only because a DelayNode sits in it; feedback stays below 1 so the
    // send always decays.
    const delayInput = audioCtx.createGain();
    const delayNode = audioCtx.createDelay(2);
    const delayDamping = audioCtx.createBiquadFilter();
    const delayFeedback = audioCtx.createGain();
    const delayWetGain = audioCtx.createGain();
    // Chorus: a short modulated delay line. The LFO swings the delay time
    // around its base value; the modulator is started/stopped with the
    // reverb modulators (see startMixerInsertModulators).
    const chorusInput = audioCtx.createGain();
    const chorusDelay = audioCtx.createDelay(0.1);
    const chorusWetGain = audioCtx.createGain();
    const maximizerInput = audioCtx.createGain();
    const maximizerPreGain = audioCtx.createGain();
    const maximizerCompressor = audioCtx.createDynamicsCompressor();
    const maximizerSoftClip = audioCtx.createWaveShaper();
    const maximizerCeilingGain = audioCtx.createGain();
    const outputGain = audioCtx.createGain();

    // --- optional analysis nodes (real-time path only) --------------------
    let analyser = null;
    let maximizerPreAnalyser = null;
    let maximizerPostAnalyser = null;
    let maximizerPreSplit = null;
    let maximizerPostSplit = null;
    let maximizerOutSplit = null;
    let maximizerPreLeftAnalyser = null;
    let maximizerPreRightAnalyser = null;
    let maximizerPostLeftAnalyser = null;
    let maximizerPostRightAnalyser = null;
    let maximizerOutLeftAnalyser = null;
    let maximizerOutRightAnalyser = null;
    let maximizerAnalyser = null;

    if (includeAnalysers) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -96;
      analyser.maxDecibels = -12;
      analyser.smoothingTimeConstant = 0.58;

      maximizerPreAnalyser = audioCtx.createAnalyser();
      maximizerPostAnalyser = audioCtx.createAnalyser();
      maximizerPreSplit = audioCtx.createChannelSplitter(2);
      maximizerPostSplit = audioCtx.createChannelSplitter(2);
      maximizerOutSplit = audioCtx.createChannelSplitter(2);
      maximizerPreLeftAnalyser = audioCtx.createAnalyser();
      maximizerPreRightAnalyser = audioCtx.createAnalyser();
      maximizerPostLeftAnalyser = audioCtx.createAnalyser();
      maximizerPostRightAnalyser = audioCtx.createAnalyser();
      maximizerOutLeftAnalyser = audioCtx.createAnalyser();
      maximizerOutRightAnalyser = audioCtx.createAnalyser();
      maximizerAnalyser = audioCtx.createAnalyser();

      maximizerAnalyser.fftSize = 1024;
      maximizerAnalyser.minDecibels = -96;
      maximizerAnalyser.maxDecibels = -12;
      maximizerAnalyser.smoothingTimeConstant = 0.35;
      maximizerPreAnalyser.fftSize = 1024;
      maximizerPreAnalyser.minDecibels = -96;
      maximizerPreAnalyser.maxDecibels = -12;
      maximizerPreAnalyser.smoothingTimeConstant = 0.25;
      maximizerPostAnalyser.fftSize = 1024;
      maximizerPostAnalyser.minDecibels = -96;
      maximizerPostAnalyser.maxDecibels = -12;
      maximizerPostAnalyser.smoothingTimeConstant = 0.25;
      [
        maximizerPreLeftAnalyser,
        maximizerPreRightAnalyser,
        maximizerPostLeftAnalyser,
        maximizerPostRightAnalyser,
        maximizerOutLeftAnalyser,
        maximizerOutRightAnalyser,
      ].forEach(function (nodeRef) {
        nodeRef.fftSize = 1024;
        nodeRef.minDecibels = -96;
        nodeRef.maxDecibels = -12;
        nodeRef.smoothingTimeConstant = 0.22;
      });
    }

    // --- common routing ----------------------------------------------------
    inputGain.connect(splitter);

    splitter.connect(leftToLeft, 0);
    splitter.connect(rightToLeft, 1);
    splitter.connect(leftToRight, 0);
    splitter.connect(rightToRight, 1);

    leftToLeft.connect(merger, 0, 0);
    rightToLeft.connect(merger, 0, 0);
    leftToRight.connect(merger, 0, 1);
    rightToRight.connect(merger, 0, 1);

    merger.connect(panner);
    // Serial insert chain: the panner feeds ONLY the chain entry. The dry
    // gain and the reverb send are fed from the chain tail instead (see
    // below), so insert effects stack and sends hear the processed sound.
    panner.connect(eqInput);

    eqLowCut.type = "highpass";
    eqLowCut.frequency.value = 20;
    eqLowCut.Q.value = 0.707;
    eqInput.connect(eqLowCut);

    let eqTail = eqLowCut;
    eqBands.forEach(function (band) {
      eqTail.connect(band);
      eqTail = band;
    });
    eqTail.connect(compressorInput);

    // Compressor dry/wet: the dry path bypasses the DynamicsCompressorNode
    // (parallel compression at mix < 1, full bypass at mix 0); the wet
    // path runs compressor -> makeup gain so makeup only lifts the
    // compressed signal, never the dry one.
    compressorInput.connect(compressorDryGain);
    compressorDryGain.connect(compressorOutput);
    compressorInput.connect(compressor);
    compressor.connect(compressorMakeupGain);
    compressorMakeupGain.connect(compressorWetGain);
    compressorWetGain.connect(compressorOutput);

    compressorOutput.connect(saturationInput);

    // Saturation dry/wet: the dry path bypasses the shaper entirely
    // (parallel saturation at mix < 1, full bypass at mix 0); the wet
    // path runs drive -> shaper -> tone -> output trim so the tone and
    // output controls only shape the saturated signal, never the dry one.
    saturationInput.connect(saturationDryGain);
    saturationDryGain.connect(saturationOutput);
    saturationInput.connect(saturationDrive);
    saturationDrive.connect(saturationShaper);
    saturationShaper.connect(saturationTone);
    saturationTone.connect(saturationOutputGain);
    saturationOutputGain.connect(saturationWetGain);
    saturationWetGain.connect(saturationOutput);

    saturationOutput.connect(filterInput);

    // Filter dry/wet mirrors the saturation routing: dry bypasses the
    // biquad, wet runs through it.
    filterInput.connect(filterDryGain);
    filterDryGain.connect(filterOutput);
    filterInput.connect(filterBiquad);
    filterBiquad.connect(filterWetGain);
    filterWetGain.connect(filterOutput);

    filterOutput.connect(transientInput);

    // Transient dry/wet mirrors the filter routing: dry bypasses the
    // shaper, wet runs through it (worklet node or fallback gain).
    transientInput.connect(transientDryGain);
    transientDryGain.connect(transientOutput);
    transientInput.connect(transientNode);
    transientNode.connect(transientWetGain);
    transientWetGain.connect(transientOutput);

    transientOutput.connect(maximizerInput);

    reverbInput.connect(reverbPreDelay);
    reverbLoCut.type = "highpass";
    reverbHiCut.type = "lowpass";
    reverbPreDelay.connect(reverbLoCut);
    reverbLoCut.connect(reverbHiCut);

    const earlyTapTimes = [0.011, 0.019, 0.031, 0.043];
    const earlyTapGains = [0.5, 0.36, 0.26, 0.2];
    const reverbEarlyTaps = earlyTapTimes.map(function (timeSeconds, idx) {
      const delay = audioCtx.createDelay(0.25);
      const gain = audioCtx.createGain();
      delay.delayTime.value = timeSeconds;
      gain.gain.value = earlyTapGains[idx] || 0.2;
      reverbHiCut.connect(delay);
      delay.connect(gain);
      gain.connect(reverbEarlyGain);
      return {
        delay,
        gain,
        baseTime: timeSeconds,
      };
    });
    reverbEarlyGain.connect(reverbWetGain);

    reverbHiCut.connect(reverbLateInput);
    reverbLateInput.connect(reverbLateLeftDelay);
    reverbLateInput.connect(reverbLateRightDelay);

    reverbLateLeftDelay.connect(reverbLeftDamping);
    reverbLateRightDelay.connect(reverbRightDamping);

    reverbLeftDamping.type = "lowpass";
    reverbRightDamping.type = "lowpass";

    reverbLeftDamping.connect(reverbLeftFeedback);
    reverbRightDamping.connect(reverbRightFeedback);
    reverbLeftFeedback.connect(reverbLateRightDelay);
    reverbRightFeedback.connect(reverbLateLeftDelay);

    reverbLeftDamping.connect(reverbLeftToLeft);
    reverbLeftDamping.connect(reverbLeftToRight);
    reverbRightDamping.connect(reverbRightToLeft);
    reverbRightDamping.connect(reverbRightToRight);

    reverbLeftToLeft.connect(reverbWidthMerger, 0, 0);
    reverbRightToLeft.connect(reverbWidthMerger, 0, 0);
    reverbLeftToRight.connect(reverbWidthMerger, 0, 1);
    reverbRightToRight.connect(reverbWidthMerger, 0, 1);

    reverbWidthMerger.connect(reverbWetGain);
    reverbWetGain.connect(fxWetGain);

    // Delay send: input gates the send, the damping filter sits inside
    // the feedback loop (each repeat passes through it once more), and
    // the wet tap is taken after the damping so the first repeat is
    // already softened.
    delayDamping.type = "lowpass";
    delayInput.connect(delayNode);
    delayNode.connect(delayDamping);
    delayDamping.connect(delayWetGain);
    delayWetGain.connect(fxWetGain);
    delayDamping.connect(delayFeedback);
    delayFeedback.connect(delayNode);

    // Chorus send: the modulated delay line feeds the shared wet bus.
    chorusInput.connect(chorusDelay);
    chorusDelay.connect(chorusWetGain);
    chorusWetGain.connect(fxWetGain);

    // Maximizer routing differs when analysis nodes are present.
    // Either way the chain tail feeds the dry gain and the reverb send.
    maximizerInput.connect(maximizerPreGain);
    let chainTail;
    if (includeAnalysers) {
      maximizerPreGain.connect(maximizerPreAnalyser);
      maximizerPreGain.connect(maximizerPreSplit);
      maximizerPreSplit.connect(maximizerPreLeftAnalyser, 0);
      maximizerPreSplit.connect(maximizerPreRightAnalyser, 1);
      maximizerPreAnalyser.connect(maximizerCompressor);
      maximizerCompressor.connect(maximizerSoftClip);
      maximizerSoftClip.connect(maximizerPostAnalyser);
      maximizerSoftClip.connect(maximizerPostSplit);
      maximizerPostSplit.connect(maximizerPostLeftAnalyser, 0);
      maximizerPostSplit.connect(maximizerPostRightAnalyser, 1);
      maximizerPostAnalyser.connect(maximizerCeilingGain);
      maximizerCeilingGain.connect(maximizerAnalyser);
      maximizerCeilingGain.connect(maximizerOutSplit);
      maximizerOutSplit.connect(maximizerOutLeftAnalyser, 0);
      maximizerOutSplit.connect(maximizerOutRightAnalyser, 1);
      chainTail = maximizerAnalyser;
    } else {
      maximizerPreGain.connect(maximizerCompressor);
      maximizerCompressor.connect(maximizerSoftClip);
      maximizerSoftClip.connect(maximizerCeilingGain);
      chainTail = maximizerCeilingGain;
    }
    chainTail.connect(fxDryGain);
    chainTail.connect(reverbInput);
    chainTail.connect(delayInput);
    chainTail.connect(chorusInput);

    const reverbModulators = [
      reverbLateLeftDelay,
      reverbLateRightDelay,
    ].map(function (targetDelay, index) {
      const lfo = audioCtx.createOscillator();
      const depth = audioCtx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.35 + index * 0.09;
      depth.gain.value = 0;
      lfo.connect(depth);
      depth.connect(targetDelay.delayTime);
      return {
        lfo,
        depth,
        isStarted: false,
      };
    });

    // One chorus modulator: a sine LFO swinging the chorus delay time.
    // Depth 0 means a static delay (no wobble); the LFO still runs so
    // the modulation is click-free when depth comes back up.
    const chorusModulators = (function () {
      const lfo = audioCtx.createOscillator();
      const depth = audioCtx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.8;
      depth.gain.value = 0;
      lfo.connect(depth);
      depth.connect(chorusDelay.delayTime);
      return [
        {
          lfo,
          depth,
          isStarted: false,
        },
      ];
    })();

    fxDryGain.connect(outputGain);
    fxWetGain.connect(outputGain);

    if (includeAnalysers) {
      outputGain.connect(analyser);
    }

    // --- build the descriptor object ---------------------------------------
    const nodeDescriptor = {
      inputGain,
      splitter,
      leftToLeft,
      rightToLeft,
      leftToRight,
      rightToRight,
      merger,
      panner,
      fxDryGain,
      fxWetGain,
      eqInput,
      eqLowCut,
      eqBands,
      compressorInput,
      compressor,
      compressorMakeupGain,
      compressorDryGain,
      compressorWetGain,
      compressorOutput,
      saturationInput,
      saturationDryGain,
      saturationDrive,
      saturationShaper,
      saturationTone,
      saturationOutputGain,
      saturationWetGain,
      saturationOutput,
      filterInput,
      filterDryGain,
      filterBiquad,
      filterWetGain,
      filterOutput,
      transientInput,
      transientDryGain,
      transientNode,
      transientWorkletReady,
      transientWetGain,
      transientOutput,
      reverbInput,
      reverbPreDelay,
      reverbLoCut,
      reverbHiCut,
      reverbEarlyGain,
      reverbEarlyTaps,
      reverbLateInput,
      reverbLateLeftDelay,
      reverbLateRightDelay,
      reverbLeftFeedback,
      reverbRightFeedback,
      reverbLeftDamping,
      reverbRightDamping,
      reverbLeftToLeft,
      reverbRightToLeft,
      reverbLeftToRight,
      reverbRightToRight,
      reverbWidthMerger,
      reverbModulators,
      reverbWetGain,
      delayInput,
      delayNode,
      delayDamping,
      delayFeedback,
      delayWetGain,
      chorusInput,
      chorusDelay,
      chorusWetGain,
      chorusModulators,
      maximizerInput,
      maximizerPreGain,
      maximizerCompressor,
      maximizerSoftClip,
      maximizerCeilingGain,
      outputGain,
    };

    if (includeAnalysers) {
      Object.assign(nodeDescriptor, {
        analyser,
        maximizerPreAnalyser,
        maximizerPostAnalyser,
        maximizerPreSplit,
        maximizerPostSplit,
        maximizerOutSplit,
        maximizerPreLeftAnalyser,
        maximizerPreRightAnalyser,
        maximizerPostLeftAnalyser,
        maximizerPostRightAnalyser,
        maximizerOutLeftAnalyser,
        maximizerOutRightAnalyser,
        maximizerAnalyser,
        meterData: new Float32Array(analyser.fftSize),
        spectrumData: new Uint8Array(analyser.frequencyBinCount),
        maximizerMeterWaveform: new Uint8Array(maximizerAnalyser.fftSize),
        maximizerPreWaveform: new Uint8Array(maximizerPreAnalyser.fftSize),
        maximizerPostWaveform: new Uint8Array(maximizerPostAnalyser.fftSize),
        maximizerPreLeftWaveform: new Uint8Array(maximizerPreLeftAnalyser.fftSize),
        maximizerPreRightWaveform: new Uint8Array(maximizerPreRightAnalyser.fftSize),
        maximizerPostLeftWaveform: new Uint8Array(maximizerPostLeftAnalyser.fftSize),
        maximizerPostRightWaveform: new Uint8Array(maximizerPostRightAnalyser.fftSize),
        maximizerOutLeftWaveform: new Uint8Array(maximizerOutLeftAnalyser.fftSize),
        maximizerOutRightWaveform: new Uint8Array(maximizerOutRightAnalyser.fftSize),
        maximizerWaveform: new Uint8Array(maximizerAnalyser.fftSize),
        meterLevel: 0,
      });
    }

    insertMap.set(insert.id, nodeDescriptor);
  });

  /**
   * Returns the audio node that should be used as the insert's output.
   * In the real-time path this is the terminal analyser so that inter-insert
   * routing carries meter data; in the offline path it is simply outputGain.
   */
  function getOutputNode(node) {
    return node.analyser || node.outputGain;
  }

  return {
    insertMap,
    getOutputNode,
  };
}

export function startMixerInsertModulators(graphOrInsertMap, audioCtx) {
  if (!graphOrInsertMap || !audioCtx) {
    return;
  }

  const inserts = graphOrInsertMap instanceof Map
    ? graphOrInsertMap
    : graphOrInsertMap.inserts;

  if (!(inserts instanceof Map)) {
    return;
  }

  inserts.forEach(function (node) {
    // Reverb and chorus modulators share one start path: both are LFOs
    // that can only start() once, so both use the isStarted guard.
    const modulators = []
      .concat(Array.isArray(node.reverbModulators) ? node.reverbModulators : [])
      .concat(Array.isArray(node.chorusModulators) ? node.chorusModulators : []);

    modulators.forEach(function (mod) {
      if (mod.isStarted) {
        return;
      }

      try {
        mod.lfo.start(audioCtx.currentTime);
      } catch {
        // OscillatorNode.start can only succeed once; mark as started either way.
      }

      mod.isStarted = true;
    });
  });
}

export function stopMixerInsertModulators(node) {
  const modulators = []
    .concat(Array.isArray(node?.reverbModulators) ? node.reverbModulators : [])
    .concat(Array.isArray(node?.chorusModulators) ? node.chorusModulators : []);

  modulators.forEach(function (mod) {
    try {
      if (mod.isStarted) {
        mod.lfo.stop();
      }
    } catch {
      // The oscillator may already have stopped during graph teardown.
    }
  });
}

/**
 * Swaps unity-gain fallback nodes in transient stages for real
 * AudioWorkletNodes, in place, once the worklet module is registered
 * for this context.  The swap rewires one stage at a time
 * (transientInput -> worklet -> transientWetGain) and leaves the rest
 * of the graph untouched; callers must re-apply insert settings
 * afterwards so the new nodes get their attack/sustain values.
 *
 * @param {Map|{inserts:Map}} graphOrInsertMap – realtime graph object
 *   or offline insert map.
 * @param {BaseAudioContext} audioCtx – the context the nodes belong to.
 * @returns {number} how many inserts were upgraded.
 */
export function upgradeTransientWorkletNodes(graphOrInsertMap, audioCtx) {
  if (
    !graphOrInsertMap ||
    !audioCtx ||
    !isTransientShaperWorkletReady(audioCtx)
  ) {
    return 0;
  }

  const inserts =
    graphOrInsertMap instanceof Map
      ? graphOrInsertMap
      : graphOrInsertMap.inserts;

  if (!(inserts instanceof Map)) {
    return 0;
  }

  let upgraded = 0;
  inserts.forEach(function (node) {
    if (
      !node ||
      node.transientWorkletReady ||
      !node.transientInput ||
      !node.transientNode ||
      !node.transientWetGain
    ) {
      return;
    }

    const workletNode = createTransientShaperNode(audioCtx);
    if (!workletNode) {
      return;
    }

    const fallbackNode = node.transientNode;
    try {
      node.transientInput.disconnect(fallbackNode);
    } catch {
      // The input may already be disconnected during teardown.
    }
    try {
      fallbackNode.disconnect();
    } catch {
      // The fallback may already be disconnected.
    }
    node.transientInput.connect(workletNode);
    workletNode.connect(node.transientWetGain);
    node.transientNode = workletNode;
    node.transientWorkletReady = true;
    upgraded += 1;
  });

  return upgraded;
}
