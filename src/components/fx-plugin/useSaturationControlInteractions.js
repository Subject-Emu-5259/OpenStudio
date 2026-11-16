import { useCallback, useEffect, useRef, useState } from "react";

// Manage Saturation editor knobs: drag, wheel, reset, and inline numeric editing.
// Mirrors useCompressorControlInteractions; saturation has no scaled params,
// so the editScale handling is a no-op here (scale defaults to 1).
export const useSaturationControlInteractions = function ({
  saturationParams,
  setSaturationValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const saturationDragRef = useRef(null);
  const [draggingSaturationParam, setDraggingSaturationParam] = useState("");
  const [editingSaturationParam, setEditingSaturationParam] = useState("");
  const [editingSaturationText, setEditingSaturationText] = useState("");

  const adjustSaturationValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setSaturationValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setSaturationValue],
  );

  const beginSaturationDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(saturationParams[control.param] || 0);
    saturationDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      control,
    };
    setDraggingSaturationParam(control.param);
  };

  const onSaturationWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(saturationParams[control.param] || 0);
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustSaturationValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetSaturationControl = function (control) {
    adjustSaturationValue(control, Number(control.defaultValue));
  };

  const beginSaturationEdit = function (control) {
    const scale = Number(control.editScale || 1);
    const raw = Number(saturationParams[control.param] || 0) * scale;
    setEditingSaturationParam(control.param);
    setEditingSaturationText(String(roundToStepFn(raw, control.step * scale)));
  };

  const commitSaturationEdit = function (control) {
    const parsed = parseNumericInputFn(editingSaturationText);
    if (parsed !== null) {
      const scale = Number(control.editScale || 1);
      adjustSaturationValue(control, parsed / scale);
    }
    setEditingSaturationParam("");
    setEditingSaturationText("");
  };

  useEffect(
    function () {
      if (!draggingSaturationParam || !saturationDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = saturationDragRef.current;
        if (!drag) {
          return;
        }

        const range = drag.control.max - drag.control.min;
        const delta = drag.startY - event.clientY;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustSaturationValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        saturationDragRef.current = null;
        setDraggingSaturationParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustSaturationValue, draggingSaturationParam],
  );

  return {
    draggingSaturationParam,
    beginSaturationDrag,
    onSaturationWheel,
    resetSaturationControl,
    editingSaturationParam,
    editingSaturationText,
    setEditingSaturationParam,
    setEditingSaturationText,
    commitSaturationEdit,
    beginSaturationEdit,
  };
};
