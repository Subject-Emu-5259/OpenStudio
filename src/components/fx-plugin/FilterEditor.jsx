// Dedicated UI renderer for the Filter effect branch.
export function FilterEditor({
  filterControls,
  filterParams,
  filterModeOptions,
  setFilterValue,
  draggingFilterParam,
  beginFilterDrag,
  onFilterWheel,
  resetFilterControl,
  editingFilterParam,
  editingFilterText,
  setEditingFilterText,
  commitFilterEdit,
  beginFilterEdit,
  setEditingFilterParam,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-filter-shell">
        {/* Mode is an enum, so it gets a segmented row instead of a knob. */}
        <div className="fx-filter-mode-row">
          <span>Mode</span>
          <div className="fx-filter-mode-options">
            {filterModeOptions.map(function (option) {
              const isSelected = filterParams.mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={
                    "fx-filter-mode-option" +
                    (isSelected ? " is-selected" : "")
                  }
                  aria-pressed={isSelected}
                  onClick={function () {
                    setFilterValue("mode", option.value);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Each card maps to one filter parameter with drag/wheel/type editing. */}
        <div className="fx-filter-grid">
          {filterControls.map(function (control) {
            const value = Number(filterParams[control.param] || 0);
            // Log controls (cutoff) fill the knob ring by log position, so
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
                  "fx-filter-control" +
                  (draggingFilterParam === control.param ? " is-active" : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-filter-knob"
                  onMouseDown={function (event) {
                    beginFilterDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onFilterWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetFilterControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  <svg
                    className="fx-filter-knob-meter"
                    viewBox="0 0 58 58"
                    aria-hidden="true"
                  >
                    <circle
                      className="fx-filter-knob-track"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                    />
                    <circle
                      className="fx-filter-knob-fill"
                      cx="29"
                      cy="29"
                      r="25"
                      pathLength="1"
                      style={knobFillStyle}
                    />
                  </svg>
                  <span className="fx-filter-knob-face" />
                </button>

                {editingFilterParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-filter-inline-input"
                    value={editingFilterText}
                    onChange={function (event) {
                      setEditingFilterText(event.target.value);
                    }}
                    onBlur={function () {
                      commitFilterEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitFilterEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingFilterParam("");
                        setEditingFilterText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-filter-value"
                    onDoubleClick={function () {
                      beginFilterEdit(control);
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
