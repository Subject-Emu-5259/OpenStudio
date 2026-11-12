import { CheckCircle2 } from "lucide-react";
import type {
  AiOperationResult,
  AiPreparedOperation,
  AiRejectedOperation,
} from "../../types/ai"

interface AiAgentPlanPanelProps {
  operations: AiPreparedOperation[]
  operationResults: AiOperationResult[]
  rejectedOperations: AiRejectedOperation[]
  lastReplyStagedNothing?: boolean
  isApplying: boolean
  onApply: () => void
  onUndo: () => void
  canUndo: boolean
}

export function AiAgentPlanPanel({
  operations,
  operationResults,
  rejectedOperations,
  lastReplyStagedNothing,
  isApplying,
  onApply,
  onUndo,
  canUndo,
}: AiAgentPlanPanelProps) {
  const hasOperations = operations.length > 0;
  const hasResults = operationResults.length > 0;
  const hasRejected = rejectedOperations.length > 0;

  return (
    <aside className="ai-agent-plan-card">
      <div className="ai-agent-plan-header">
        <CheckCircle2 size={16} />
        <span>Preview + Apply</span>
      </div>

      {hasOperations ? (
        <ol className="ai-agent-operation-list">
          {operations.map(function (operation) {
            return (
              <li key={operation.id} className={operation.status === "warning" ? "has-warning" : ""}>
                <span>{operation.description}</span>
                {operation.issues && operation.issues.length > 0 ? (
                  <small>{operation.issues.join(" ")}</small>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : hasResults ? (
        <ol className="ai-agent-operation-list">
          {operationResults.map(function (result) {
            return (
              <li key={result.id || result.description} className={"is-" + result.status}>
                <span>{result.description}</span>
                {result.reason ? <small>{result.reason}</small> : null}
              </li>
            );
          })}
        </ol>
      ) : lastReplyStagedNothing ? (
        <p>
          The last reply staged no changes — it was text only. Ask for
          something specific, like “add a kick pattern at 140 BPM”, and
          the steps will appear here. If it keeps answering in text,
          the model in Settings may be too weak for the plan format.
        </p>
      ) : (
        <p>
          No plan staged yet. Ask the agent to build something — a beat,
          a pattern, a mix change — and the steps will appear here.
          Nothing changes until you press Apply Plan.
        </p>
      )}

      {hasRejected ? (
        <div className="ai-agent-rejected-list">
          <strong>Ignored unsafe operations</strong>
          {rejectedOperations.map(function (item) {
            return <span key={item.index}>{item.reason}</span>;
          })}
        </div>
      ) : null}

      <div className="ai-agent-plan-actions">
        <button
          type="button"
          className="ai-agent-apply-btn"
          disabled={!hasOperations || isApplying}
          onClick={onApply}
        >
          {isApplying ? "Applying..." : "Apply Plan"}
        </button>
        <button
          type="button"
          className="ai-agent-undo-btn"
          disabled={!canUndo}
          onClick={onUndo}
        >
          Undo
        </button>
      </div>
    </aside>
  );
}
