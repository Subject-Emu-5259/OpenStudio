import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiAgentStreamStatus } from "./AiAgentStreamStatus";

describe("AiAgentStreamStatus", function () {
  afterEach(function () {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the partial text, op count, and elapsed time", function () {
    render(
      <AiAgentStreamStatus
        streamingText='{"operations": [{"type": "set_bpm"'
        streamingStartedAt={Date.now()}
        streamingOpCount={1}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Receiving plan…")).toBeInTheDocument();
    expect(screen.getByText(/1 operation so far/)).toBeInTheDocument();
    expect(screen.getByText("0s")).toBeInTheDocument();
    expect(
      screen.getByText('{"operations": [{"type": "set_bpm"', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows a waiting placeholder before the first tokens arrive", function () {
    render(
      <AiAgentStreamStatus
        streamingText=""
        streamingStartedAt={Date.now()}
        streamingOpCount={0}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Waiting for the first tokens…"),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 operations so far/)).toBeInTheDocument();
  });

  it("ticks the elapsed time once a second", function () {
    vi.useFakeTimers();
    render(
      <AiAgentStreamStatus
        streamingText=""
        streamingStartedAt={Date.now()}
        streamingOpCount={0}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("0s")).toBeInTheDocument();
    act(function () {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("5s")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async function () {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <AiAgentStreamStatus
        streamingText="partial"
        streamingStartedAt={Date.now()}
        streamingOpCount={0}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
