export const PLUGIN_EFFECTS = [
  {
    effectType: "graphic-eq",
    name: "Graphic EQ",
    description: "7-point draggable parametric equalizer",
  },
  {
    effectType: "reverb",
    name: "Reverb",
    description: "Algorithmic stereo reverb with freeze and modulation",
  },
  {
    effectType: "maximizer",
    name: "Limiter",
    description: "Mastering limiter with threshold, ceiling and character",
  },
  {
    effectType: "compressor",
    name: "Compressor",
    description: "Dynamics compressor with threshold, ratio, knee and mix",
  },
  {
    effectType: "saturation",
    name: "Saturation",
    description: "Harmonic saturation with drive, tone and mix",
  },
  {
    effectType: "filter",
    name: "Filter",
    description: "Sweepable lowpass, highpass, bandpass or notch filter",
  },
  {
    effectType: "delay",
    name: "Delay",
    description: "Tempo-style echo with feedback and damping",
  },
  {
    effectType: "chorus",
    name: "Chorus",
    description: "Modulated doubling for width on keys and pads",
  },
  {
    effectType: "transient",
    name: "Transient Shaper",
    description: "Attack and sustain shaping for drum punch and body",
  },
];

const effectByType = PLUGIN_EFFECTS.reduce(function (acc, effect) {
  acc[effect.effectType] = effect;
  return acc;
}, {});

export function getPluginEffect(effectType) {
  const key = String(effectType || "").trim();
  return effectByType[key] || null;
}
