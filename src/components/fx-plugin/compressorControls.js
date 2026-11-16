import { formatPercent, toDbLabel } from "./fxPluginUtils";

// Static compressor control configuration used by the Compressor editor view.
// Attack/release are stored in seconds but shown and typed in milliseconds
// (editScale 1000); the interaction hook converts on edit begin/commit.
export const COMPRESSOR_CONTROLS = [
  {
    param: "thresholdDb",
    label: "Threshold",
    min: -60,
    max: 0,
    step: 0.5,
    defaultValue: -24,
    format: toDbLabel,
  },
  {
    param: "ratio",
    label: "Ratio",
    min: 1,
    max: 20,
    step: 0.1,
    defaultValue: 4,
    format: function (value) {
      return Number(value || 0).toFixed(1) + ":1";
    },
  },
  {
    param: "kneeDb",
    label: "Knee",
    min: 0,
    max: 40,
    step: 0.5,
    defaultValue: 6,
    format: toDbLabel,
  },
  {
    param: "attackSec",
    label: "Attack",
    min: 0.0005,
    max: 0.5,
    step: 0.0005,
    defaultValue: 0.01,
    editScale: 1000,
    format: function (value) {
      return (Number(value || 0) * 1000).toFixed(1) + " ms";
    },
  },
  {
    param: "releaseSec",
    label: "Release",
    min: 0.01,
    max: 1,
    step: 0.005,
    defaultValue: 0.18,
    editScale: 1000,
    format: function (value) {
      return Math.round(Number(value || 0) * 1000) + " ms";
    },
  },
  {
    param: "makeupGainDb",
    label: "Makeup",
    min: 0,
    max: 24,
    step: 0.1,
    defaultValue: 0,
    format: toDbLabel,
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
