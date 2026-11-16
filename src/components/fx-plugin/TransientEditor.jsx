
// Dedicated UI renderer for the Transient Shaper effect branch.
export function TransientEditor({
  transientControls,
  transientParams,
  draggingTransientParam,
  beginTransientDrag,
  onTransientWheel,
  resetTransientControl,
  editingTransientParam,
  editingTransientText,
  setEditingTransientText,
  commitTransientEdit,
  beginTransientEdit,
  setEditingTransientParam,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-transient-shell">
        {/* Each card maps to one transient parameter with drag/wheel/type editing. */}
        <div className="fx-transient-grid">
          {transientControls.map(function (control) {
            const value = Number(transientParams[control.param] || 0);
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
                  "fx-transient-control" +
                  (draggingTransientParam === control.param ? " is-active" : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-transient-knob"
                  onMouseDown={function (event) {
                    beginTransientDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onTransientWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetTransientControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  <svg
                    className="fx-transient-knob-meter"
                    viewBox="0 0 58 58"
                    aria-hidden="true"
                  >
                    <circle
                      className="fx-transient-knob-track"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                    />
                    <circle
                      className="fx-transient-knob-fill"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                      style={knobFillStyle}
                    />
                  </svg>
                  <span className="fx-transient-knob-face" />
                </button>

                {editingTransientParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-transient-inline-input"
                    value={editingTransientText}
                    onChange={function (event) {
                      setEditingTransientText(event.target.value);
                    }}
                    onBlur={function () {
                      commitTransientEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitTransientEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingTransientParam("");
                        setEditingTransientText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-transient-value"
                    onDoubleClick={function () {
                      beginTransientEdit(control);
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
