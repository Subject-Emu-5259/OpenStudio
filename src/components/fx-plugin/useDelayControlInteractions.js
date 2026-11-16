import { useCallback, useEffect, useRef, useState } from "react";

// Manage Delay editor knobs: drag, wheel, reset, and inline numeric editing.
// Mirrors useFilterControlInteractions: log controls (hi cut) move through
// log space, so a drag from 1.2 kHz to 18 kHz feels even instead of
// spending most of the travel on the top octave. Inline typing always
// takes plain values — ms for time, Hz for hi cut, no scale conversion.
function toLogNorm(value, min, max) {
  return (
    (Math.log(Math.max(min, value)) - Math.log(min)) /
    (Math.log(max) - Math.log(min))
  );
}

function fromLogNorm(norm, min, max) {
  return min * Math.pow(max / min, Math.max(0, Math.min(1, norm)));
}

export const useDelayControlInteractions = function ({
  delayParams,
  setDelayValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const delayDragRef = useRef(null);
  const [draggingDelayParam, setDraggingDelayParam] = useState("");
  const [editingDelayParam, setEditingDelayParam] = useState("");
  const [editingDelayText, setEditingDelayText] = useState("");

  const adjustDelayValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setDelayValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setDelayValue],
  );

  const beginDelayDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(delayParams[control.param] || 0);
    delayDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      startNorm: control.log
        ? toLogNorm(startValue, control.min, control.max)
        : 0,
      control,
    };
    setDraggingDelayParam(control.param);
  };

  const onDelayWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(delayParams[control.param] || 0);
    if (control.log) {
      // Log wheel steps multiply/divide, so each notch moves the same
      // musical distance anywhere in the range.
      const factor = event.shiftKey ? 1.02 : 1.06;
      adjustDelayValue(control, current * Math.pow(factor, direction));
      return;
    }
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustDelayValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetDelayControl = function (control) {
    adjustDelayValue(control, Number(control.defaultValue));
  };

  const beginDelayEdit = function (control) {
    const raw = Number(delayParams[control.param] || 0);
    setEditingDelayParam(control.param);
    setEditingDelayText(String(roundToStepFn(raw, control.step)));
  };

  const commitDelayEdit = function (control) {
    const parsed = parseNumericInputFn(editingDelayText);
    if (parsed !== null) {
      adjustDelayValue(control, parsed);
    }
    setEditingDelayParam("");
    setEditingDelayText("");
  };

  useEffect(
    function () {
      if (!draggingDelayParam || !delayDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = delayDragRef.current;
        if (!drag) {
          return;
        }

        const delta = drag.startY - event.clientY;
        if (drag.control.log) {
          const normDelta = delta / (event.shiftKey ? 700 : 160);
          adjustDelayValue(
            drag.control,
            fromLogNorm(
              drag.startNorm + normDelta,
              drag.control.min,
              drag.control.max,
            ),
          );
          return;
        }

        const range = drag.control.max - drag.control.min;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustDelayValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        delayDragRef.current = null;
        setDraggingDelayParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustDelayValue, draggingDelayParam],
  );

  return {
    draggingDelayParam,
    beginDelayDrag,
    onDelayWheel,
    resetDelayControl,
    editingDelayParam,
    editingDelayText,
    setEditingDelayParam,
    setEditingDelayText,
    commitDelayEdit,
    beginDelayEdit,
  };
};
