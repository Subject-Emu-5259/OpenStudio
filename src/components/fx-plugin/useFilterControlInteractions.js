import { useCallback, useEffect, useRef, useState } from "react";

// Manage Filter editor knobs: drag, wheel, reset, and inline numeric editing.
// Mirrors useCompressorControlInteractions, with one difference: log controls
// (cutoff) move through log space, so a drag from 20 Hz to 20 kHz feels even
// instead of spending 90% of the travel on the top octave. Inline typing
// always takes plain Hz — no scale conversion.
function toLogNorm(value, min, max) {
  return (
    (Math.log(Math.max(min, value)) - Math.log(min)) /
    (Math.log(max) - Math.log(min))
  );
}

function fromLogNorm(norm, min, max) {
  return min * Math.pow(max / min, Math.max(0, Math.min(1, norm)));
}

export const useFilterControlInteractions = function ({
  filterParams,
  setFilterValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const filterDragRef = useRef(null);
  const [draggingFilterParam, setDraggingFilterParam] = useState("");
  const [editingFilterParam, setEditingFilterParam] = useState("");
  const [editingFilterText, setEditingFilterText] = useState("");

  const adjustFilterValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setFilterValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setFilterValue],
  );

  const beginFilterDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(filterParams[control.param] || 0);
    filterDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      startNorm: control.log
        ? toLogNorm(startValue, control.min, control.max)
        : 0,
      control,
    };
    setDraggingFilterParam(control.param);
  };

  const onFilterWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(filterParams[control.param] || 0);
    if (control.log) {
      // Log wheel steps multiply/divide, so each notch moves the same
      // musical distance anywhere in the range.
      const factor = event.shiftKey ? 1.02 : 1.06;
      adjustFilterValue(control, current * Math.pow(factor, direction));
      return;
    }
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustFilterValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetFilterControl = function (control) {
    adjustFilterValue(control, Number(control.defaultValue));
  };

  const beginFilterEdit = function (control) {
    const raw = Number(filterParams[control.param] || 0);
    setEditingFilterParam(control.param);
    setEditingFilterText(String(roundToStepFn(raw, control.step)));
  };

  const commitFilterEdit = function (control) {
    const parsed = parseNumericInputFn(editingFilterText);
    if (parsed !== null) {
      adjustFilterValue(control, parsed);
    }
    setEditingFilterParam("");
    setEditingFilterText("");
  };

  useEffect(
    function () {
      if (!draggingFilterParam || !filterDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = filterDragRef.current;
        if (!drag) {
          return;
        }

        const delta = drag.startY - event.clientY;
        if (drag.control.log) {
          const normDelta = delta / (event.shiftKey ? 700 : 160);
          adjustFilterValue(
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
        adjustFilterValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        filterDragRef.current = null;
        setDraggingFilterParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustFilterValue, draggingFilterParam],
  );

  return {
    draggingFilterParam,
    beginFilterDrag,
    onFilterWheel,
    resetFilterControl,
    editingFilterParam,
    editingFilterText,
    setEditingFilterParam,
    setEditingFilterText,
    commitFilterEdit,
    beginFilterEdit,
  };
};
