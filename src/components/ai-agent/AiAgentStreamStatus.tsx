import { useEffect, useRef, useState } from "react";

// Live status for an in-flight plan stream. Slow providers (Optra at
// ~8 tokens/s) take minutes per plan; without this the user stares at
// a disabled "Thinking..." button with no idea whether anything is
// happening. The partial text, elapsed time, and operation count make
// the wait legible, and Cancel stops it. Styles live in ai-agent.css.

interface AiAgentStreamStatusProps {
  streamingText: string
  streamingStartedAt: number
  streamingOpCount: number
  onCancel: () => void
}

export function AiAgentStreamStatus({
  streamingText,
  streamingStartedAt,
  streamingOpCount,
  onCancel,
}: AiAgentStreamStatusProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const textRef = useRef<HTMLPreElement | null>(null);

  // The tick recomputes from the start timestamp instead of counting
  // up, so timer drift never accumulates over a long stream.
  useEffect(
    function () {
      function tick() {
        setElapsedSec(
          Math.max(0, Math.floor((Date.now() - streamingStartedAt) / 1000)),
        );
      }
      tick();
      const timer = setInterval(tick, 1000);
      return function () {
        clearInterval(timer);
      };
    },
    [streamingStartedAt],
  );

  // Follow the newest tokens as they arrive.
  useEffect(
    function () {
      const el = textRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    },
    [streamingText],
  );

  return (
    <div className="ai-agent-stream-status" aria-live="polite">
      <div className="ai-agent-stream-status-header">
        <span className="ai-agent-stream-status-label">Receiving plan…</span>
        <span className="ai-agent-stream-status-meta">{elapsedSec}s</span>
        <span className="ai-agent-stream-status-meta">
          {streamingOpCount}
          {" "}
          {streamingOpCount === 1 ? "operation" : "operations"}
          {" "}
          so far
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="ai-agent-stream-status-cancel"
        >
          Cancel
        </button>
      </div>
      <pre ref={textRef} className="ai-agent-stream-status-text">
        {streamingText || "Waiting for the first tokens…"}
      </pre>
    </div>
  );
}
