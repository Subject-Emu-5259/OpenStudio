import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChorusEditor } from "./ChorusEditor";
import { CHORUS_CONTROLS } from "./chorusControls";

const DEFAULT_PARAMS = {
  rateHz: 0.8,
  depth: 0.4,
  delayMs: 15,
  mix: 0.35,
};

function renderEditor(overrides = {}) {
  const props = {
    chorusControls: CHORUS_CONTROLS,
    chorusParams: DEFAULT_PARAMS,
    setChorusValue: vi.fn(),
    draggingChorusParam: "",
    beginChorusDrag: vi.fn(),
    onChorusWheel: vi.fn(),
    resetChorusControl: vi.fn(),
    editingChorusParam: "",
    editingChorusText: "",
    setEditingChorusText: vi.fn(),
    commitChorusEdit: vi.fn(),
    beginChorusEdit: vi.fn(),
    setEditingChorusParam: vi.fn(),
    ...overrides,
  };
  return { rendered: render(<ChorusEditor {...props} />), props };
}

describe("ChorusEditor", () => {
  it("renders one knob per chorus parameter with formatted values", () => {
    renderEditor();

    expect(screen.getByLabelText("Rate")).toBeInTheDocument();
    expect(screen.getByLabelText("Depth")).toBeInTheDocument();
    expect(screen.getByLabelText("Delay")).toBeInTheDocument();
    expect(screen.getByLabelText("Mix")).toBeInTheDocument();

    expect(screen.getByText("0.8 Hz")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("15 ms")).toBeInTheDocument();
    expect(screen.getByText("35%")).toBeInTheDocument();
  });

  it("fills the rate knob ring by linear position", () => {
    const { rendered } = renderEditor();

    // 0.8 Hz sits at (0.8 - 0.1) / (8 - 0.1) ~= 0.089 of the 0.1–8 Hz
    // range, so the ring fill offset is ~0.911.
    const fills = rendered.container.querySelectorAll(".fx-chorus-knob-fill");
    expect(fills.length).toBe(4);
    expect(Number(fills[0].style.strokeDashoffset)).toBeCloseTo(0.911, 2);
  });

  it("renders the inline editor when a param is being edited", () => {
    const { rendered } = renderEditor({
      editingChorusParam: "delayMs",
      editingChorusText: "22",
    });

    const input = rendered.container.querySelector(".fx-chorus-inline-input");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("22");
  });
});
