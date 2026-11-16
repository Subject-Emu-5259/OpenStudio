import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FX_EFFECT_CHORUS,
  FX_EFFECT_COMPRESSOR,
  FX_EFFECT_DELAY,
  FX_EFFECT_FILTER,
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  FX_EFFECT_SATURATION,
  FX_EFFECT_TRANSIENT,
} from "../audio/domain/fxParams";
import { ChorusEditor } from "./fx-plugin/ChorusEditor";
import { CHORUS_CONTROLS } from "./fx-plugin/chorusControls";
import { CompressorEditor } from "./fx-plugin/CompressorEditor";
import { COMPRESSOR_CONTROLS } from "./fx-plugin/compressorControls";
import { DelayEditor } from "./fx-plugin/DelayEditor";
import { DELAY_CONTROLS } from "./fx-plugin/delayControls";
import { FilterEditor } from "./fx-plugin/FilterEditor";
import {
  FILTER_CONTROLS,
  FILTER_MODE_OPTIONS,
} from "./fx-plugin/filterControls";
import { TransientEditor } from "./fx-plugin/TransientEditor";
import { TRANSIENT_CONTROLS } from "./fx-plugin/transientControls";
import { EmptyFxSlotState } from "./fx-plugin/EmptyFxSlotState";
import { GraphicEqEditor } from "./fx-plugin/GraphicEqEditor";
import { MaximizerEditor } from "./fx-plugin/MaximizerEditor";
import { ReverbEditor } from "./fx-plugin/ReverbEditor";
import { REVERB_CONTROLS } from "./fx-plugin/reverbControls";
import { SaturationEditor } from "./fx-plugin/SaturationEditor";
import {
  SATURATION_CONTROLS,
  SATURATION_MODE_OPTIONS,
} from "./fx-plugin/saturationControls";
import { useFxEmptySlotDropTarget } from "./fx-plugin/useFxEmptySlotDropTarget";
import { useChorusControlInteractions } from "./fx-plugin/useChorusControlInteractions";
import { useCompressorControlInteractions } from "./fx-plugin/useCompressorControlInteractions";
import { useDelayControlInteractions } from "./fx-plugin/useDelayControlInteractions";
import { useFilterControlInteractions } from "./fx-plugin/useFilterControlInteractions";
import { useFxEditorSelection } from "./fx-plugin/useFxEditorSelection";
import { useFxMaximizerMetrics } from "./fx-plugin/useFxMaximizerMetrics";
import { useGraphicEqControlInteractions } from "./fx-plugin/useGraphicEqControlInteractions";
import { useGraphicEqPointDrag } from "./fx-plugin/useGraphicEqPointDrag";
import { useReverbControlInteractions } from "./fx-plugin/useReverbControlInteractions";
import { useSaturationControlInteractions } from "./fx-plugin/useSaturationControlInteractions";
import { useTransientControlInteractions } from "./fx-plugin/useTransientControlInteractions";
import {
  buildGraphicEqPath,
  buildMaximizerTransferPath,
  buildSpectrumPaths,
  buildWaveformPath,
  buildWaveformReductionPath,
  clamp,
  getPointShapePercent,
  getQFromShapePercent,
  GRAPHIC_EQ_BAND_TYPES,
  GRAPH_FREQUENCY_GUIDES,
  GRAPH_GRID_ROWS_PER_SIDE,
  GRAPH_HEIGHT,
  GRAPH_MAX_DB,
  GRAPH_MAX_FREQ,
  GRAPH_MIN_FREQ,
  GRAPH_PADDING,
  GRAPH_WIDTH,
  parseDbInput,
  parseFrequencyInput,
  parseNumericInput,
  parseShapePercentInput,
  roundToStep,
  toDbLabel,
  toFrequencyLabel,
  toShapeLabel,
  WHEEL_SHAPE_STEP_PERCENT,
} from "./fx-plugin/fxPluginUtils";
import {
  setFxSlotChorusParam,
  setFxSlotCompressorParam,
  setFxSlotDelayParam,
  setFxSlotEffectType,
  setFxSlotFilterParam,
  setFxSlotGraphicEqPoint,
  setFxSlotMaximizerParam,
  setFxSlotReverbParam,
  setFxSlotSaturationParam,
  setFxSlotTransientParam,
  setWindowRect,
  toggleFxSlot,
} from "../store";

const FX_WINDOW_ID = "fxPlugin";
const FX_WINDOW_TITLEBAR_HEIGHT = 40;
const FX_WINDOW_FRAME_CHROME = 2;
const FX_WINDOW_MIN_WIDTH = 320;
const FX_WINDOW_MIN_HEIGHT = 240;
const FX_WINDOW_FIT_SELECTOR =
  ".fx-proq-shell, .fx-reverb-shell, .fx-maximizer-shell, .fx-compressor-shell, .fx-saturation-shell, .fx-filter-shell, .fx-delay-shell, .fx-chorus-shell, .fx-transient-shell";

function measureNaturalEditorSize(host) {
  const source = host?.querySelector(FX_WINDOW_FIT_SELECTOR);
  if (!source) {
    return null;
  }

  const clone = source.cloneNode(true);
  clone.style.position = "fixed";
  clone.style.left = "-10000px";
  clone.style.top = "-10000px";
  clone.style.width = "max-content";
  clone.style.height = "auto";
  clone.style.minHeight = "0";
  clone.style.maxHeight = "none";
  clone.style.visibility = "hidden";
  clone.style.pointerEvents = "none";

  document.body.appendChild(clone);
  const rect = clone.getBoundingClientRect();
  const measured = {
    width: Math.ceil(Math.max(rect.width, clone.scrollWidth)),
    height: Math.ceil(Math.max(rect.height, clone.scrollHeight)),
  };
  clone.remove();

  return measured;
}

export function FxPluginWindow() {
  const dispatch = useDispatch();
  const fitRef = useRef(null);
  const fxWindow = useSelector(function (state) {
    return state.daw.ui.windows[FX_WINDOW_ID];
  });
  const {
    activeInsert,
    activeSlot,
    activeInsertId,
    activeSlotId,
    eqParams,
    reverbParams,
    maximizerParams,
    compressorParams,
    saturationParams,
    filterParams,
    delayParams,
    chorusParams,
    transientParams,
  } = useFxEditorSelection();

  const applyDroppedEffectType = useCallback(
    function (effectType) {
      if (!activeInsert || !activeSlot) {
        return;
      }

      // Dropped browser plugin becomes the new effect type for this slot.
      dispatch(
        setFxSlotEffectType({
          insertId: activeInsert.id,
          slotId: activeSlot.id,
          effectType,
        }),
      );

      // Auto-enable slot after replacing effect so preview works immediately.
      if (!(activeSlot.effectType === effectType && activeSlot.enabled)) {
        dispatch(
          toggleFxSlot({
            insertId: activeInsert.id,
            slotId: activeSlot.id,
          }),
        );
      }
    },
    [activeInsert, activeSlot, dispatch],
  );

  const {
    isEmptyDropTarget,
    onEmptySlotDragOver,
    onEmptySlotDragLeave,
    onEmptySlotDrop,
  } = useFxEmptySlotDropTarget(applyDroppedEffectType);

  const eqCurvePath = useMemo(
    function () {
      return buildGraphicEqPath(eqParams, GRAPH_WIDTH, GRAPH_HEIGHT);
    },
    [eqParams],
  );

  const spectrumPaths = useMemo(
    function () {
      return buildSpectrumPaths(
        Array.isArray(activeInsert?.meterSpectrum)
          ? activeInsert.meterSpectrum
          : null,
        GRAPH_WIDTH,
        GRAPH_HEIGHT,
      );
    },
    [activeInsert],
  );

  const {
    maximizerWaveformPath,
    maximizerTransferPath,
    maximizerThresholdWavePath,
    maximizerOutDb,
  } = useFxMaximizerMetrics({
    activeInsert,
    maximizerParams,
    clampFn: clamp,
    buildWaveformPathFn: buildWaveformPath,
    buildMaximizerTransferPathFn: buildMaximizerTransferPath,
    buildWaveformReductionPathFn: buildWaveformReductionPath,
  });

  const { graphRef, draggingPointIndex, setDraggingPointIndex, pointCoordinates } =
    useGraphicEqPointDrag({
      eqParams,
      activeInsertId,
      activeSlotId,
      dispatch,
      setFxSlotGraphicEqPointAction: setFxSlotGraphicEqPoint,
      clampFn: clamp,
      graphPadding: GRAPH_PADDING,
      graphWidth: GRAPH_WIDTH,
      graphHeight: GRAPH_HEIGHT,
      graphMinFreq: GRAPH_MIN_FREQ,
      graphMaxFreq: GRAPH_MAX_FREQ,
      graphMaxDb: GRAPH_MAX_DB,
    });

  const setReverbValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotReverbParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setMaximizerValue = function (param, value) {
    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotMaximizerParam({
        insertId: activeInsertId,
        slotId: activeSlotId,
        param,
        value,
      }),
    );
  };

  const setCompressorValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotCompressorParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setSaturationValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotSaturationParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setFilterValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotFilterParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setDelayValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotDelayParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setChorusValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotChorusParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const setTransientValue = useCallback(
    function (param, value) {
      if (!activeInsertId || !activeSlotId) {
        return;
      }

      dispatch(
        setFxSlotTransientParam({
          insertId: activeInsertId,
          slotId: activeSlotId,
          param,
          value,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  const {
    draggingReverbParam,
    beginReverbDrag,
    onReverbWheel,
    resetReverbControl,
    editingReverbParam,
    editingReverbText,
    setEditingReverbParam,
    setEditingReverbText,
    commitReverbEdit,
    beginReverbEdit,
  } = useReverbControlInteractions({
    reverbParams,
    setReverbValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  const {
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
  } = useCompressorControlInteractions({
    compressorParams,
    setCompressorValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  const {
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
  } = useSaturationControlInteractions({
    saturationParams,
    setSaturationValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  const {
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
  } = useFilterControlInteractions({
    filterParams,
    setFilterValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  const {
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
  } = useDelayControlInteractions({
    delayParams,
    setDelayValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  const {
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
  } = useChorusControlInteractions({
    chorusParams,
    setChorusValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  const {
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
  } = useTransientControlInteractions({
    transientParams,
    setTransientValue,
    clampFn: clamp,
    roundToStepFn: roundToStep,
    parseNumericInputFn: parseNumericInput,
  });

  // Graphic EQ field editing/wheel interactions are isolated in a dedicated hook.
  const {
    editingField,
    editingValue,
    setEditingValue,
    adjustPointShapeByWheel,
    beginInlineEdit,
    onInlineEditKeyDown,
    onInlineEditBlur,
    onBandTypeChange,
  } = useGraphicEqControlInteractions({
    eqParams,
    activeInsertId,
    activeSlotId,
    dispatch,
    setFxSlotGraphicEqPointAction: setFxSlotGraphicEqPoint,
    parseFrequencyInputFn: parseFrequencyInput,
    parseDbInputFn: parseDbInput,
    parseShapePercentInputFn: parseShapePercentInput,
    getQFromShapePercentFn: getQFromShapePercent,
    getPointShapePercentFn: getPointShapePercent,
    clampFn: clamp,
    wheelShapeStepPercent: WHEEL_SHAPE_STEP_PERCENT,
  });

  useLayoutEffect(
    function () {
      if (!activeSlot?.effectType || !fxWindow?.open || fxWindow.isMaximized) {
        return;
      }

      const frameId = window.requestAnimationFrame(function () {
        const measured = measureNaturalEditorSize(fitRef.current);
        if (!measured) {
          return;
        }

        const workspace = document.querySelector(".workspace-surface");
        const viewportWidth = Math.max(
          FX_WINDOW_MIN_WIDTH,
          workspace?.clientWidth || window.innerWidth,
        );
        const viewportHeight = Math.max(
          FX_WINDOW_MIN_HEIGHT,
          workspace?.clientHeight || window.innerHeight,
        );
        const requiredWidth = measured.width + FX_WINDOW_FRAME_CHROME;
        const requiredHeight =
          measured.height + FX_WINDOW_TITLEBAR_HEIGHT + FX_WINDOW_FRAME_CHROME;
        const nextWidth = Math.min(
          viewportWidth,
          Math.max(FX_WINDOW_MIN_WIDTH, requiredWidth),
        );
        const nextHeight = Math.min(
          viewportHeight,
          Math.max(FX_WINDOW_MIN_HEIGHT, requiredHeight),
        );

        if (
          Math.abs(nextWidth - fxWindow.width) < 2 &&
          Math.abs(nextHeight - fxWindow.height) < 2
        ) {
          return;
        }

        dispatch(
          setWindowRect({
            id: FX_WINDOW_ID,
            x: Math.min(fxWindow.x, Math.max(0, viewportWidth - nextWidth)),
            y: Math.min(fxWindow.y, Math.max(0, viewportHeight - nextHeight)),
            width: nextWidth,
            height: nextHeight,
          }),
        );
      });

      return function () {
        window.cancelAnimationFrame(frameId);
      };
    },
    [activeSlot?.effectType, activeSlotId, activeInsertId, dispatch, fxWindow],
  );

  if (!activeInsert || !activeSlot) {
    return (
      <section className="fx-plugin-panel fx-window-panel">
        <div className="fx-empty-slot">
          <p>No FX slot selected.</p>
          <p>Click a slot in the Mixer to open the effect editor.</p>
        </div>
      </section>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_MAXIMIZER) {
    // Maximizer UI branch: limiter/ceiling/character controls + meter overlays.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <MaximizerEditor
          activeInsert={activeInsert}
          maximizerParams={maximizerParams}
          maximizerWaveformPath={maximizerWaveformPath}
          maximizerTransferPath={maximizerTransferPath}
          maximizerThresholdWavePath={maximizerThresholdWavePath}
          maximizerOutDb={maximizerOutDb}
          setMaximizerValue={setMaximizerValue}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_REVERB) {
    // Reverb UI branch: knob grid + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <ReverbEditor
          reverbControls={REVERB_CONTROLS}
          reverbParams={reverbParams}
          draggingReverbParam={draggingReverbParam}
          beginReverbDrag={beginReverbDrag}
          onReverbWheel={onReverbWheel}
          resetReverbControl={resetReverbControl}
          editingReverbParam={editingReverbParam}
          editingReverbText={editingReverbText}
          setEditingReverbText={setEditingReverbText}
          commitReverbEdit={commitReverbEdit}
          beginReverbEdit={beginReverbEdit}
          setEditingReverbParam={setEditingReverbParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_COMPRESSOR) {
    // Compressor UI branch: knob grid + gain-reduction meter + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <CompressorEditor
          activeInsert={activeInsert}
          compressorControls={COMPRESSOR_CONTROLS}
          compressorParams={compressorParams}
          draggingCompressorParam={draggingCompressorParam}
          beginCompressorDrag={beginCompressorDrag}
          onCompressorWheel={onCompressorWheel}
          resetCompressorControl={resetCompressorControl}
          editingCompressorParam={editingCompressorParam}
          editingCompressorText={editingCompressorText}
          setEditingCompressorText={setEditingCompressorText}
          commitCompressorEdit={commitCompressorEdit}
          beginCompressorEdit={beginCompressorEdit}
          setEditingCompressorParam={setEditingCompressorParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_SATURATION) {
    // Saturation UI branch: mode row + knob grid + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <SaturationEditor
          saturationControls={SATURATION_CONTROLS}
          saturationParams={saturationParams}
          saturationModeOptions={SATURATION_MODE_OPTIONS}
          setSaturationValue={setSaturationValue}
          draggingSaturationParam={draggingSaturationParam}
          beginSaturationDrag={beginSaturationDrag}
          onSaturationWheel={onSaturationWheel}
          resetSaturationControl={resetSaturationControl}
          editingSaturationParam={editingSaturationParam}
          editingSaturationText={editingSaturationText}
          setEditingSaturationText={setEditingSaturationText}
          commitSaturationEdit={commitSaturationEdit}
          beginSaturationEdit={beginSaturationEdit}
          setEditingSaturationParam={setEditingSaturationParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_FILTER) {
    // Filter UI branch: mode row + knob grid (log cutoff) + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <FilterEditor
          filterControls={FILTER_CONTROLS}
          filterParams={filterParams}
          filterModeOptions={FILTER_MODE_OPTIONS}
          setFilterValue={setFilterValue}
          draggingFilterParam={draggingFilterParam}
          beginFilterDrag={beginFilterDrag}
          onFilterWheel={onFilterWheel}
          resetFilterControl={resetFilterControl}
          editingFilterParam={editingFilterParam}
          editingFilterText={editingFilterText}
          setEditingFilterText={setEditingFilterText}
          commitFilterEdit={commitFilterEdit}
          beginFilterEdit={beginFilterEdit}
          setEditingFilterParam={setEditingFilterParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_DELAY) {
    // Delay UI branch: knob grid (log hi cut) + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <DelayEditor
          delayControls={DELAY_CONTROLS}
          delayParams={delayParams}
          draggingDelayParam={draggingDelayParam}
          beginDelayDrag={beginDelayDrag}
          onDelayWheel={onDelayWheel}
          resetDelayControl={resetDelayControl}
          editingDelayParam={editingDelayParam}
          editingDelayText={editingDelayText}
          setEditingDelayText={setEditingDelayText}
          commitDelayEdit={commitDelayEdit}
          beginDelayEdit={beginDelayEdit}
          setEditingDelayParam={setEditingDelayParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_CHORUS) {
    // Chorus UI branch: knob grid + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <ChorusEditor
          chorusControls={CHORUS_CONTROLS}
          chorusParams={chorusParams}
          draggingChorusParam={draggingChorusParam}
          beginChorusDrag={beginChorusDrag}
          onChorusWheel={onChorusWheel}
          resetChorusControl={resetChorusControl}
          editingChorusParam={editingChorusParam}
          editingChorusText={editingChorusText}
          setEditingChorusText={setEditingChorusText}
          commitChorusEdit={commitChorusEdit}
          beginChorusEdit={beginChorusEdit}
          setEditingChorusParam={setEditingChorusParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_TRANSIENT) {
    // Transient UI branch: knob grid + typed value editing.
    return (
      <div className="fx-plugin-fit-host" ref={fitRef}>
        <TransientEditor
          transientControls={TRANSIENT_CONTROLS}
          transientParams={transientParams}
          draggingTransientParam={draggingTransientParam}
          beginTransientDrag={beginTransientDrag}
          onTransientWheel={onTransientWheel}
          resetTransientControl={resetTransientControl}
          editingTransientParam={editingTransientParam}
          editingTransientText={editingTransientText}
          setEditingTransientText={setEditingTransientText}
          commitTransientEdit={commitTransientEdit}
          beginTransientEdit={beginTransientEdit}
          setEditingTransientParam={setEditingTransientParam}
        />
      </div>
    );
  }

  if (activeSlot.effectType !== FX_EFFECT_GRAPHIC_EQ) {
    // Fallback UI for empty/unsupported slots.
    return (
      <EmptyFxSlotState
        isEmptyDropTarget={isEmptyDropTarget}
        onEmptySlotDragOver={onEmptySlotDragOver}
        onEmptySlotDragLeave={onEmptySlotDragLeave}
        onEmptySlotDrop={onEmptySlotDrop}
      />
    );
  }

  return (
    // Graphic EQ UI branch: curve editor, draggable points, and per-band readouts.
    <div className="fx-plugin-fit-host" ref={fitRef}>
      <GraphicEqEditor
        graphRef={graphRef}
        graphWidth={GRAPH_WIDTH}
        graphHeight={GRAPH_HEIGHT}
        graphPadding={GRAPH_PADDING}
        graphMaxDb={GRAPH_MAX_DB}
        graphGridRowsPerSide={GRAPH_GRID_ROWS_PER_SIDE}
        graphFrequencyGuides={GRAPH_FREQUENCY_GUIDES}
        spectrumPaths={spectrumPaths}
        eqCurvePath={eqCurvePath}
        pointCoordinates={pointCoordinates}
        draggingPointIndex={draggingPointIndex}
        adjustPointShapeByWheel={adjustPointShapeByWheel}
        setDraggingPointIndex={setDraggingPointIndex}
        eqParams={eqParams}
        editingField={editingField}
        editingValue={editingValue}
        setEditingValue={setEditingValue}
        onInlineEditKeyDown={onInlineEditKeyDown}
        onInlineEditBlur={onInlineEditBlur}
        beginInlineEdit={beginInlineEdit}
        toFrequencyLabel={toFrequencyLabel}
        toDbLabel={toDbLabel}
        toShapeLabel={toShapeLabel}
        onBandTypeChange={onBandTypeChange}
        bandTypeOptions={GRAPHIC_EQ_BAND_TYPES}
      />
    </div>
  );
}


