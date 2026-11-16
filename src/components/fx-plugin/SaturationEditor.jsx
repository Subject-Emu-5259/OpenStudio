// Dedicated UI renderer for the Saturation effect branch.
export function SaturationEditor({
  saturationControls,
  saturationParams,
  saturationModeOptions,
  setSaturationValue,
  draggingSaturationParam,
  beginSaturationDrag,
  onSaturationWheel,
  resetSaturationControl,
  editingSaturationParam,
  editingSaturationText,
  setEditingSaturationText,
  commitSaturationEdit,
  beginSaturationEdit,
  setEditingSaturationParam,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-saturation-shell">
        {/* Mode is an enum, so it gets a segmented row instead of a knob. */}
        <div className="fx-saturation-mode-row">
          <span>Mode</span>
          <div className="fx-saturation-mode-options">
            {saturationModeOptions.map(function (option) {
              const isSelected = saturationParams.mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={
                    "fx-saturation-mode-option" +
                    (isSelected ? " is-selected" : "")
                  }
                  aria-pressed={isSelected}
                  onClick={function () {
                    setSaturationValue("mode", option.value);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Each card maps to one saturation parameter with drag/wheel/type editing. */}
        <div className="fx-saturation-grid">
          {saturationControls.map(function (control) {
            const value = Number(saturationParams[control.param] || 0);
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
                  "fx-saturation-control" +
                  (draggingSaturationParam === control.param
                    ? " is-active"
                    : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-saturation-knob"
                  onMouseDown={function (event) {
                    beginSaturationDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onSaturationWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetSaturationControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  <svg
                    className="fx-saturation-knob-meter"
                    viewBox="0 0 58 58"
                    aria-hidden="true"
                  >
                    <circle
                      className="fx-saturation-knob-track"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                    />
                    <circle
                      className="fx-saturation-knob-fill"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                      style={knobFillStyle}
                    />
                  </svg>
                  <span className="fx-saturation-knob-face" />
                </button>

                {editingSaturationParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-saturation-inline-input"
                    value={editingSaturationText}
                    onChange={function (event) {
                      setEditingSaturationText(event.target.value);
                    }}
                    onBlur={function () {
                      commitSaturationEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitSaturationEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingSaturationParam("");
                        setEditingSaturationText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-saturation-value"
                    onDoubleClick={function () {
                      beginSaturationEdit(control);
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
