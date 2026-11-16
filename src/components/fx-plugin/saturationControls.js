import { formatPercent, toDbLabel } from "./fxPluginUtils";

// Static saturation control configuration used by the Saturation editor view.
// Mode is not a knob — it is a segmented row (see SaturationEditor) because
// a knob cannot represent an enum.
export const SATURATION_CONTROLS = [
  {
    param: "drive",
    label: "Drive",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.3,
    format: formatPercent,
  },
  {
    param: "tone",
    label: "Tone",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
    format: formatPercent,
  },
  {
    param: "outputDb",
    label: "Output",
    min: -12,
    max: 12,
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

export const SATURATION_MODE_OPTIONS = [
  { value: "soft", label: "Soft" },
  { value: "hard", label: "Hard" },
];
