import { formatPercent } from "./fxPluginUtils";

// Static delay control configuration used by the Delay editor view.
// Hi Cut is a LOG knob (log: true): the interaction hook converts drag and
// wheel moves through log space so the sweep feels even from 1.2 kHz to
// 18 kHz. Time is plain ms — the agent computes tempo-synced values.
export const DELAY_CONTROLS = [
  {
    param: "timeMs",
    label: "Time",
    min: 1,
    max: 2000,
    step: 1,
    defaultValue: 320,
    format: function (value) {
      return Math.round(Number(value || 0)) + " ms";
    },
  },
  {
    param: "feedback",
    label: "Feedback",
    min: 0,
    max: 0.85,
    step: 0.01,
    defaultValue: 0.35,
    format: formatPercent,
  },
  {
    param: "hiCutHz",
    label: "Hi Cut",
    min: 1200,
    max: 18000,
    step: 1,
    defaultValue: 8000,
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
    param: "mix",
    label: "Mix",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.25,
    format: formatPercent,
  },
];
