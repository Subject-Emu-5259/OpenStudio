import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaturationEditor } from "./SaturationEditor";
import {
  SATURATION_CONTROLS,
  SATURATION_MODE_OPTIONS,
} from "./saturationControls";

const DEFAULT_PARAMS = {
  drive: 0.3,
  mode: "soft",
  tone: 0.5,
  mix: 1,
  outputDb: 0,
};

function renderEditor(overrides = {}) {
  const props = {
    saturationControls: SATURATION_CONTROLS,
    saturationParams: DEFAULT_PARAMS,
    saturationModeOptions: SATURATION_MODE_OPTIONS,
    setSaturationValue: vi.fn(),
    draggingSaturationParam: "",
    beginSaturationDrag: vi.fn(),
    onSaturationWheel: vi.fn(),
    resetSaturationControl: vi.fn(),
    editingSaturationParam: "",
    editingSaturationText: "",
    setEditingSaturationText: vi.fn(),
    commitSaturationEdit: vi.fn(),
    beginSaturationEdit: vi.fn(),
    setEditingSaturationParam: vi.fn(),
    ...overrides,
  };
  return { rendered: render(<SaturationEditor {...props} />), props };
}

describe("SaturationEditor", () => {
  it("renders one knob per saturation parameter with formatted values", () => {
    renderEditor();

    expect(screen.getByLabelText("Drive")).toBeInTheDocument();
    expect(screen.getByLabelText("Tone")).toBeInTheDocument();
    expect(screen.getByLabelText("Output")).toBeInTheDocument();
    expect(screen.getByLabelText("Mix")).toBeInTheDocument();

    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("0.0 dB")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("marks the active mode and switches mode on click", () => {
    const { props } = renderEditor();

    const softButton = screen.getByRole("button", { name: "Soft" });
    const hardButton = screen.getByRole("button", { name: "Hard" });
    expect(softButton).toHaveAttribute("aria-pressed", "true");
    expect(hardButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(hardButton);
    expect(props.setSaturationValue).toHaveBeenCalledWith("mode", "hard");
  });

  it("renders the inline editor when a param is being edited", () => {
    const { rendered } = renderEditor({
      editingSaturationParam: "drive",
      editingSaturationText: "0.6",
    });

    const input = rendered.container.querySelector(
      ".fx-saturation-inline-input",
    );
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("0.6");
  });
});
