import { useCallback, useEffect, useRef, useState } from "react";

// Manage Chorus editor knobs: drag, wheel, reset, and inline numeric editing.
// Mirrors useSaturationControlInteractions; chorus has no log or scaled
// params, so all four knobs move linearly through their ranges.
export const useChorusControlInteractions = function ({
  chorusParams,
  setChorusValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const chorusDragRef = useRef(null);
  const [draggingChorusParam, setDraggingChorusParam] = useState("");
  const [editingChorusParam, setEditingChorusParam] = useState("");
  const [editingChorusText, setEditingChorusText] = useState("");

  const adjustChorusValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setChorusValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setChorusValue],
  );

  const beginChorusDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(chorusParams[control.param] || 0);
    chorusDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      control,
    };
    setDraggingChorusParam(control.param);
  };

  const onChorusWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(chorusParams[control.param] || 0);
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustChorusValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetChorusControl = function (control) {
    adjustChorusValue(control, Number(control.defaultValue));
  };

  const beginChorusEdit = function (control) {
    const raw = Number(chorusParams[control.param] || 0);
    setEditingChorusParam(control.param);
    setEditingChorusText(String(roundToStepFn(raw, control.step)));
  };

  const commitChorusEdit = function (control) {
    const parsed = parseNumericInputFn(editingChorusText);
    if (parsed !== null) {
      adjustChorusValue(control, parsed);
    }
    setEditingChorusParam("");
    setEditingChorusText("");
  };

  useEffect(
    function () {
      if (!draggingChorusParam || !chorusDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = chorusDragRef.current;
        if (!drag) {
          return;
        }

        const range = drag.control.max - drag.control.min;
        const delta = drag.startY - event.clientY;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustChorusValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        chorusDragRef.current = null;
        setDraggingChorusParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustChorusValue, draggingChorusParam],
  );

  return {
    draggingChorusParam,
    beginChorusDrag,
    onChorusWheel,
    resetChorusControl,
    editingChorusParam,
    editingChorusText,
    setEditingChorusParam,
    setEditingChorusText,
    commitChorusEdit,
    beginChorusEdit,
  };
};
