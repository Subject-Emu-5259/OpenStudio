import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompressorEditor } from "./CompressorEditor";
import { COMPRESSOR_CONTROLS } from "./compressorControls";

const DEFAULT_PARAMS = {
  thresholdDb: -24,
  ratio: 4,
  kneeDb: 6,
  attackSec: 0.01,
  releaseSec: 0.18,
  makeupGainDb: 0,
  mix: 1,
};

function renderEditor(overrides = {}) {
  const props = {
    activeInsert: { compressorReduction: 0 },
    compressorControls: COMPRESSOR_CONTROLS,
    compressorParams: DEFAULT_PARAMS,
    draggingCompressorParam: "",
    beginCompressorDrag: vi.fn(),
    onCompressorWheel: vi.fn(),
    resetCompressorControl: vi.fn(),
    editingCompressorParam: "",
    editingCompressorText: "",
    setEditingCompressorText: vi.fn(),
    commitCompressorEdit: vi.fn(),
    beginCompressorEdit: vi.fn(),
    setEditingCompressorParam: vi.fn(),
    ...overrides,
  };
  return render(<CompressorEditor {...props} />);
}

describe("CompressorEditor", () => {
  it("renders one knob per compressor parameter with formatted values", () => {
    renderEditor();

    expect(screen.getByLabelText("Threshold")).toBeInTheDocument();
    expect(screen.getByLabelText("Ratio")).toBeInTheDocument();
    expect(screen.getByLabelText("Knee")).toBeInTheDocument();
    expect(screen.getByLabelText("Attack")).toBeInTheDocument();
    expect(screen.getByLabelText("Release")).toBeInTheDocument();
    expect(screen.getByLabelText("Makeup")).toBeInTheDocument();
    expect(screen.getByLabelText("Mix")).toBeInTheDocument();

    expect(screen.getByText("-24.0 dB")).toBeInTheDocument();
    expect(screen.getByText("4.0:1")).toBeInTheDocument();
    expect(screen.getByText("10.0 ms")).toBeInTheDocument();
    expect(screen.getByText("180 ms")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows the gain-reduction meter from the insert state", () => {
    const { container } = renderEditor({
      activeInsert: { compressorReduction: 9 },
    });

    expect(screen.getByText("GR")).toBeInTheDocument();
    expect(screen.getByText("-9.0 dB")).toBeInTheDocument();
    const fill = container.querySelector(".fx-compressor-gr-fill");
    expect(fill.style.width).toBe("25%");
  });

  it("clamps the gain-reduction meter to the 0-36 dB range", () => {
    const { container } = renderEditor({
      activeInsert: { compressorReduction: 99 },
    });

    expect(screen.getByText("-36.0 dB")).toBeInTheDocument();
    const fill = container.querySelector(".fx-compressor-gr-fill");
    expect(fill.style.width).toBe("100%");
  });
});
