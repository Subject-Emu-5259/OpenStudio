import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterEditor } from "./FilterEditor";
import { FILTER_CONTROLS, FILTER_MODE_OPTIONS } from "./filterControls";

const DEFAULT_PARAMS = {
  cutoffHz: 18000,
  resonance: 1,
  mode: "lowpass",
  mix: 1,
};

function renderEditor(overrides = {}) {
  const props = {
    filterControls: FILTER_CONTROLS,
    filterParams: DEFAULT_PARAMS,
    filterModeOptions: FILTER_MODE_OPTIONS,
    setFilterValue: vi.fn(),
    draggingFilterParam: "",
    beginFilterDrag: vi.fn(),
    onFilterWheel: vi.fn(),
    resetFilterControl: vi.fn(),
    editingFilterParam: "",
    editingFilterText: "",
    setEditingFilterText: vi.fn(),
    commitFilterEdit: vi.fn(),
    beginFilterEdit: vi.fn(),
    setEditingFilterParam: vi.fn(),
    ...overrides,
  };
  return { rendered: render(<FilterEditor {...props} />), props };
}

describe("FilterEditor", () => {
  it("renders one knob per filter parameter with formatted values", () => {
    renderEditor();

    expect(screen.getByLabelText("Cutoff")).toBeInTheDocument();
    expect(screen.getByLabelText("Reso")).toBeInTheDocument();
    expect(screen.getByLabelText("Mix")).toBeInTheDocument();

    expect(screen.getByText("18 kHz")).toBeInTheDocument();
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("formats sub-1kHz cutoffs in Hz", () => {
    renderEditor({
      filterParams: { ...DEFAULT_PARAMS, cutoffHz: 800 },
    });

    expect(screen.getByText("800 Hz")).toBeInTheDocument();
  });

  it("marks the active mode and switches mode on click", () => {
    const { props } = renderEditor();

    const lowpassButton = screen.getByRole("button", { name: "LP" });
    const highpassButton = screen.getByRole("button", { name: "HP" });
    expect(lowpassButton).toHaveAttribute("aria-pressed", "true");
    expect(highpassButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(highpassButton);
    expect(props.setFilterValue).toHaveBeenCalledWith("mode", "highpass");
  });

  it("fills the cutoff knob ring by log position", () => {
    const { rendered } = renderEditor({
      filterParams: { ...DEFAULT_PARAMS, cutoffHz: 600 },
    });

    // 600 Hz sits at log-norm (ln(600/20) / ln(1000)) ~= 0.492 of the
    // 20 Hz–20 kHz range, so the ring fill offset is ~0.508.
    const fills = rendered.container.querySelectorAll(".fx-filter-knob-fill");
    expect(fills.length).toBe(3);
    expect(Number(fills[0].style.strokeDashoffset)).toBeCloseTo(0.508, 2);
  });

  it("renders the inline editor when a param is being edited", () => {
    const { rendered } = renderEditor({
      editingFilterParam: "cutoffHz",
      editingFilterText: "800",
    });

    const input = rendered.container.querySelector(".fx-filter-inline-input");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("800");
  });
});
