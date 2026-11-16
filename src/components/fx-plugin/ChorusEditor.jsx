// Dedicated UI renderer for the Chorus effect branch.
export function ChorusEditor({
  chorusControls,
  chorusParams,
  draggingChorusParam,
  beginChorusDrag,
  onChorusWheel,
  resetChorusControl,
  editingChorusParam,
  editingChorusText,
  setEditingChorusText,
  commitChorusEdit,
  beginChorusEdit,
  setEditingChorusParam,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-chorus-shell">
        {/* Each card maps to one chorus parameter with drag/wheel/type editing. */}
        <div className="fx-chorus-grid">
          {chorusControls.map(function (control) {
            const value = Number(chorusParams[control.param] || 0);
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
                  "fx-chorus-control" +
                  (draggingChorusParam === control.param ? " is-active" : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-chorus-knob"
                  onMouseDown={function (event) {
                    beginChorusDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onChorusWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetChorusControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  <svg
                    className="fx-chorus-knob-meter"
                    viewBox="0 0 58 58"
                    aria-hidden="true"
                  >
                    <circle
                      className="fx-chorus-knob-track"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                    />
                    <circle
                      className="fx-chorus-knob-fill"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                      style={knobFillStyle}
                    />
                  </svg>
                  <span className="fx-chorus-knob-face" />
                </button>

                {editingChorusParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-chorus-inline-input"
                    value={editingChorusText}
                    onChange={function (event) {
                      setEditingChorusText(event.target.value);
                    }}
                    onBlur={function () {
                      commitChorusEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitChorusEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingChorusParam("");
                        setEditingChorusText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-chorus-value"
                    onDoubleClick={function () {
                      beginChorusEdit(control);
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
