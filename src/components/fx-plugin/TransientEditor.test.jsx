
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransientEditor } from "./TransientEditor";
import { TRANSIENT_CONTROLS } from "./transientControls";

const DEFAULT_PARAMS = {
  attack: 0.5,
  sustain: -0.25,
  mix: 0.75,
};

function renderEditor(overrides = {}) {
  const props = {
    transientControls: TRANSIENT_CONTROLS,
    transientParams: DEFAULT_PARAMS,
    draggingTransientParam: "",
    beginTransientDrag: vi.fn(),
    onTransientWheel: vi.fn(),
    resetTransientControl: vi.fn(),
    editingTransientParam: "",
    editingTransientText: "",
    setEditingTransientText: vi.fn(),
    commitTransientEdit: vi.fn(),
    beginTransientEdit: vi.fn(),
    setEditingTransientParam: vi.fn(),
    ...overrides,
  };
  return { rendered: render(<TransientEditor {...props} />), props };
}

describe("TransientEditor", () => {
  it("renders one knob per transient parameter with signed values", () => {
    renderEditor();

    expect(screen.getByLabelText("Attack")).toBeInTheDocument();
    expect(screen.getByLabelText("Sustain")).toBeInTheDocument();
    expect(screen.getByLabelText("Mix")).toBeInTheDocument();

    // Attack and sustain are bipolar, so their values carry a sign.
    expect(screen.getByText("+50%")).toBeInTheDocument();
    expect(screen.getByText("-25%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("fills the attack knob ring by linear position", () => {
    const { rendered } = renderEditor();

    // Attack 0.5 sits at (0.5 - -1) / (1 - -1) = 0.75 of the -1..1
    // range, so the ring fill offset is 0.25.
    const fills = rendered.container.querySelectorAll(".fx-transient-knob-fill");
    expect(fills.length).toBe(3);
    expect(Number(fills[0].style.strokeDashoffset)).toBeCloseTo(0.25, 2);
  });

  it("renders the inline editor when a param is being edited", () => {
    const { rendered } = renderEditor({
      editingTransientParam: "attack",
      editingTransientText: "0.6",
    });

    const input = rendered.container.querySelector(".fx-transient-inline-input");
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("0.6");
  });
});
