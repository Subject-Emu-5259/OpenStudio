
import { useCallback, useEffect, useRef, useState } from "react";

// Manage Transient editor knobs: drag, wheel, reset, and inline numeric editing.
// Mirrors useChorusControlInteractions; all three knobs move linearly
// through their ranges (attack and sustain are bipolar, -1..1).
export const useTransientControlInteractions = function ({
  transientParams,
  setTransientValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const transientDragRef = useRef(null);
  const [draggingTransientParam, setDraggingTransientParam] = useState("");
  const [editingTransientParam, setEditingTransientParam] = useState("");
  const [editingTransientText, setEditingTransientText] = useState("");

  const adjustTransientValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setTransientValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setTransientValue],
  );

  const beginTransientDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(transientParams[control.param] || 0);
    transientDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      control,
    };
    setDraggingTransientParam(control.param);
  };

  const onTransientWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(transientParams[control.param] || 0);
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustTransientValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetTransientControl = function (control) {
    adjustTransientValue(control, Number(control.defaultValue));
  };

  const beginTransientEdit = function (control) {
    const raw = Number(transientParams[control.param] || 0);
    setEditingTransientParam(control.param);
    setEditingTransientText(String(roundToStepFn(raw, control.step)));
  };

  const commitTransientEdit = function (control) {
    const parsed = parseNumericInputFn(editingTransientText);
    if (parsed !== null) {
      adjustTransientValue(control, parsed);
    }
    setEditingTransientParam("");
    setEditingTransientText("");
  };

  useEffect(
    function () {
      if (!draggingTransientParam || !transientDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = transientDragRef.current;
        if (!drag) {
          return;
        }

        const range = drag.control.max - drag.control.min;
        const delta = drag.startY - event.clientY;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustTransientValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        transientDragRef.current = null;
        setDraggingTransientParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustTransientValue, draggingTransientParam],
  );

  return {
    draggingTransientParam,
    beginTransientDrag,
    onTransientWheel,
    resetTransientControl,
    editingTransientParam,
    editingTransientText,
    setEditingTransientParam,
    setEditingTransientText,
    commitTransientEdit,
    beginTransientEdit,
  };
};
