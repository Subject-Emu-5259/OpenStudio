import { formatPercent } from "./fxPluginUtils";

// Static filter control configuration used by the Filter editor view.
// Cutoff is a LOG knob (log: true): the interaction hook converts drag and
// wheel moves through log space so the sweep feels even from 20 Hz to
// 20 kHz. Mode is not a knob — it is a segmented row (see FilterEditor).
export const FILTER_CONTROLS = [
  {
    param: "cutoffHz",
    label: "Cutoff",
    min: 20,
    max: 20000,
    step: 1,
    defaultValue: 18000,
    log: true,
    format: function (value) {
      const hz = Number(value || 0);
      if (hz >= 1000) {
        return (hz / 1000).toFixed(1).replace(/\.0$/, "") + " kHz";
      }
      return Math.round(hz) + " Hz";
    },
  },
  {
    param: "resonance",
    label: "Reso",
    min: 0.5,
    max: 20,
    step: 0.1,
    defaultValue: 1,
    format: function (value) {
      return Number(value || 0).toFixed(1);
    },
  },
  {
    param: "mix",
    label: "Mix",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 1,
    format: formatPercent,
  },
];

export const FILTER_MODE_OPTIONS = [
  { value: "lowpass", label: "LP" },
  { value: "highpass", label: "HP" },
  { value: "bandpass", label: "BP" },
  { value: "notch", label: "Notch" },
];
