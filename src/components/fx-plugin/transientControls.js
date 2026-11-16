
import { formatPercent } from "./fxPluginUtils";

// Bipolar percent: +50% / -25% / 0%. Attack and sustain are signed
// (-1..1), so the plain percent format would hide the direction.
function formatSignedPercent(value) {
  const intValue = Math.round(Number(value || 0) * 100);
  if (intValue > 0) {
    return "+" + intValue + "%";
  }
  return intValue + "%";
}

// Static transient-shaper control configuration used by the Transient
// editor view. All three params are plain linear knobs: Attack sharpens
// (+) or softens (-) onsets, Sustain lifts (+) or shortens (-) the body
// and tail, and Mix blends the shaped signal against the dry one.
export const TRANSIENT_CONTROLS = [
  {
    param: "attack",
    label: "Attack",
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    format: formatSignedPercent,
  },
  {
    param: "sustain",
    label: "Sustain",
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    format: formatSignedPercent,
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
