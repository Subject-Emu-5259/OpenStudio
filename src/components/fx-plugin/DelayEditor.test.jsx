import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DelayEditor } from "./DelayEditor";
import { DELAY_CONTROLS } from "./delayControls";

const DEFAULT_PARAMS = {
  timeMs: 320,
  feedback: 0.35,
  mix: 0.25,
  hiCutHz: 8000,
};

function renderEditor(overrides = {}) {
  const props = {
    delayControls: DELAY_CONTROLS,
    delayParams: DEFAULT_PARAMS,
    setDelayValue: vi.fn(),
    draggingDelayParam: "",
    beginDelayDrag: vi.fn(),
    onDelayWheel: vi.fn(),
    resetDelayControl: vi.fn(),
    editingDelayParam: "",
    editingDelayText: "",
    setEditingDelayText: vi.fn(),
    commitDelayEdit: vi.fn(),
    beginDelayEdit: vi.fn(),
    setEditingDelayParam: vi.fn(),
    ...overrides,
  };
  return { rendered: render(<DelayEditor {...props} />), props };
}

describe("DelayEditor", () => {
  it("renders one knob per delay parameter with formatted values", () => {
    renderEditor();

    expect(screen.getByLabelText("Time")).toBeInTheDocument();
    expect(screen.getByLabelText("Feedback")).toBeInTheDocument();
    expect(screen.getByLabelText("Hi Cut")).toBeInTheDocument();
    expect(screen.getByLabelText("Mix")).toBeInTheDocument();

    expect(screen.getByText("320 ms")).toBeInTheDocument();
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByText("8 kHz")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("formats the hi cut in kHz", () => {
    renderEditor({
      delayParams: { ...DEFAULT_PARAMS, hiCutHz: 12000 },
    });

    expect(screen.getByText("12 kHz")).toBeInTheDocument();
  });

  it("fills the hi cut knob ring by log position", () => {
    const { rendered } = renderEditor();

    // 8 kHz sits at log-norm (ln(8000/1200) / ln(15)) ~= 0.700 of the
    // 1.2 kHz–18 kHz range, so the ring fill offset is ~0.300.
    const fills = rendered.container.querySelectorAll(".fx-delay-knob-fill");
    expect(fills.length).toBe(4);
    expect(Number(fills[2].style.strokeDashoffset)).toBeCloseTo(0.3, 2);
  });

  it("renders the inline editor when a param is being edited", () => {
    const { rendered } = renderEditor({
      editingDelayParam: "timeMs",
      editingDelayText: "480",
    });

    const input = rendered.container.querySelector(".fx-delay-inline-input");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("480");
  });
});
