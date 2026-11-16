// Dedicated UI renderer for the Compressor effect branch.
export function CompressorEditor({
  activeInsert,
  compressorControls,
  compressorParams,
  draggingCompressorParam,
  beginCompressorDrag,
  onCompressorWheel,
  resetCompressorControl,
  editingCompressorParam,
  editingCompressorText,
  setEditingCompressorText,
  commitCompressorEdit,
  beginCompressorEdit,
  setEditingCompressorParam,
}) {
  // Gain reduction is polled from the compressor node into Redux by the
  // meter loop (0-36 dB, positive); the bar shows how hard it is working.
  const reductionDb = Math.max(
    0,
    Math.min(36, Number(activeInsert?.compressorReduction || 0)),
  );
  const reductionRatio = reductionDb / 36;

  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-compressor-shell">
        <div className="fx-compressor-gr">
          <span>GR</span>
          <div className="fx-compressor-gr-track">
            <div
              className="fx-compressor-gr-fill"
              style={{ width: (reductionRatio * 100).toFixed(1) + "%" }}
            />
          </div>
          <strong className="fx-compressor-gr-value">
            {"-" + reductionDb.toFixed(1) + " dB"}
          </strong>
        </div>
        {/* Each card maps to one compressor parameter with drag/wheel/type editing. */}
        <div className="fx-compressor-grid">
          {compressorControls.map(function (control) {
            const value = Number(compressorParams[control.param] || 0);
            const ratio =
              control.max > control.min
                ? (value - control.min) / (control.max - control.min)
                : 0;
            const clampedRatio = Math.max(0, Math.min(1, ratio));
            const knobFillStyle =
              clampedRatio <= 0
                ? { opacity: 0 }
                : clampedRatio >= 1
                  ? { strokeDasharray: "none", strokeDashoffset: 0 }
                  : { strokeDasharray: 1, strokeDashoffset: 1 - clampedRatio };

            return (
              <div
                key={control.param}
                className={
                  "fx-compressor-control" +
                  (draggingCompressorParam === control.param
                    ? " is-active"
                    : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-compressor-knob"
                  onMouseDown={function (event) {
                    beginCompressorDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onCompressorWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetCompressorControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  <svg
                    className="fx-compressor-knob-meter"
                    viewBox="0 0 58 58"
                    aria-hidden="true"
                  >
                    <circle
                      className="fx-compressor-knob-track"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                    />
                    <circle
                      className="fx-compressor-knob-fill"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                      style={knobFillStyle}
                    />
                  </svg>
                  <span className="fx-compressor-knob-face" />
                </button>

                {editingCompressorParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-compressor-inline-input"
                    value={editingCompressorText}
                    onChange={function (event) {
                      setEditingCompressorText(event.target.value);
                    }}
                    onBlur={function () {
                      commitCompressorEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitCompressorEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingCompressorParam("");
                        setEditingCompressorText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-compressor-value"
                    onDoubleClick={function () {
                      beginCompressorEdit(control);
                    }}
                    title="Double click to type value"
                  >
                    {control.format(value)}
                  </strong>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
