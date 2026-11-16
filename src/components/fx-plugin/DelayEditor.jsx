// Dedicated UI renderer for the Delay effect branch.
export function DelayEditor({
  delayControls,
  delayParams,
  draggingDelayParam,
  beginDelayDrag,
  onDelayWheel,
  resetDelayControl,
  editingDelayParam,
  editingDelayText,
  setEditingDelayText,
  commitDelayEdit,
  beginDelayEdit,
  setEditingDelayParam,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-delay-shell">
        {/* Each card maps to one delay parameter with drag/wheel/type editing. */}
        <div className="fx-delay-grid">
          {delayControls.map(function (control) {
            const value = Number(delayParams[control.param] || 0);
            // Log controls (hi cut) fill the knob ring by log position, so
            // the ring matches where the ear hears the cutoff sitting.
            const ratio = control.log
              ? (Math.log(Math.max(control.min, value)) - Math.log(control.min)) /
                (Math.log(control.max) - Math.log(control.min))
              : control.max > control.min
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
                  "fx-delay-control" +
                  (draggingDelayParam === control.param ? " is-active" : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-delay-knob"
                  onMouseDown={function (event) {
                    beginDelayDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onDelayWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetDelayControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  <svg
                    className="fx-delay-knob-meter"
                    viewBox="0 0 58 58"
                    aria-hidden="true"
                  >
                    <circle
                      className="fx-delay-knob-track"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                    />
                    <circle
                      className="fx-delay-knob-fill"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                      style={knobFillStyle}
                    />
                  </svg>
                  <span className="fx-delay-knob-face" />
                </button>

                {editingDelayParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-delay-inline-input"
                    value={editingDelayText}
                    onChange={function (event) {
                      setEditingDelayText(event.target.value);
                    }}
                    onBlur={function () {
                      commitDelayEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitDelayEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingDelayParam("");
                        setEditingDelayText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-delay-value"
                    onDoubleClick={function () {
                      beginDelayEdit(control);
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
