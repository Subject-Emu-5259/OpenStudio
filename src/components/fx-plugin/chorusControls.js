import { formatPercent } from "./fxPluginUtils";

// Static chorus control configuration used by the Chorus editor view.
// All four params are plain linear knobs; Rate is the LFO speed in Hz,
// Depth is the LFO swing as a fraction of the 4 ms maximum, Delay is the
// base delay time, and Mix blends the doubled signal against the dry one.
export const CHORUS_CONTROLS = [
  {
    param: "rateHz",
    label: "Rate",
    min: 0.1,
    max: 8,
    step: 0.1,
    defaultValue: 0.8,
    format: function (value) {
      return Number(value || 0).toFixed(1) + " Hz";
    },
  },
  {
    param: "depth",
    label: "Depth",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.4,
    format: formatPercent,
  },
  {
    param: "delayMs",
    label: "Delay",
    min: 5,
    max: 40,
    step: 1,
    defaultValue: 15,
    format: function (value) {
      return Math.round(Number(value || 0)) + " ms";
    },
  },
  {
    param: "mix",
    label: "Mix",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.35,
    format: formatPercent,
  },
];
