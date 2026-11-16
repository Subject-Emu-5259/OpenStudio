import { useCallback, useEffect, useRef, useState } from "react";

// Manage Compressor editor knobs: drag, wheel, reset, and inline numeric editing.
// Mirrors useReverbControlInteractions; the one difference is editScale:
// attack/release are stored in seconds but typed in milliseconds, so the
// inline editor shows the scaled value and divides back on commit.
export const useCompressorControlInteractions = function ({
  compressorParams,
  setCompressorValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const compressorDragRef = useRef(null);
  const [draggingCompressorParam, setDraggingCompressorParam] = useState("");
  const [editingCompressorParam, setEditingCompressorParam] = useState("");
  const [editingCompressorText, setEditingCompressorText] = useState("");

  const adjustCompressorValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setCompressorValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setCompressorValue],
  );

  const beginCompressorDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(compressorParams[control.param] || 0);
    compressorDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      control,
    };
    setDraggingCompressorParam(control.param);
  };

  const onCompressorWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(compressorParams[control.param] || 0);
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustCompressorValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetCompressorControl = function (control) {
    adjustCompressorValue(control, Number(control.defaultValue));
  };

  const beginCompressorEdit = function (control) {
    const scale = Number(control.editScale || 1);
    const raw = Number(compressorParams[control.param] || 0) * scale;
    setEditingCompressorParam(control.param);
    setEditingCompressorText(String(roundToStepFn(raw, control.step * scale)));
  };

  const commitCompressorEdit = function (control) {
    const parsed = parseNumericInputFn(editingCompressorText);
    if (parsed !== null) {
      const scale = Number(control.editScale || 1);
      adjustCompressorValue(control, parsed / scale);
    }
    setEditingCompressorParam("");
    setEditingCompressorText("");
  };

  useEffect(
    function () {
      if (!draggingCompressorParam || !compressorDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = compressorDragRef.current;
        if (!drag) {
          return;
        }

        const range = drag.control.max - drag.control.min;
        const delta = drag.startY - event.clientY;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustCompressorValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        compressorDragRef.current = null;
        setDraggingCompressorParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustCompressorValue, draggingCompressorParam],
  );

  return {
    draggingCompressorParam,
    beginCompressorDrag,
    onCompressorWheel,
    resetCompressorControl,
    editingCompressorParam,
    editingCompressorText,
    setEditingCompressorParam,
    setEditingCompressorText,
    commitCompressorEdit,
    beginCompressorEdit,
  };
};
