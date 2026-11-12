import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react"
import type { AiMemoryProposal } from "../../types/ai";

interface AiAgentMemoryPanelProps {
  proposals: AiMemoryProposal[]
  onAcceptProposal: (proposalId: string) => void
  onDismissProposal: (proposalId: string) => void
  profileFacts: string[]
  onDeleteFact: (fact: string) => void
  onClearFacts: () => void
  projectNotesLabel: string
  onProjectNotesLabelChange: (label: string) => void
  projectNotes: string
  onProjectNotesChange: (notes: string) => void
}

export function AiAgentMemoryPanel({
  proposals,
  onAcceptProposal,
  onDismissProposal,
  profileFacts,
  onDeleteFact,
  onClearFacts,
  projectNotesLabel,
  onProjectNotesLabelChange,
  projectNotes,
  onProjectNotesChange,
}: AiAgentMemoryPanelProps) {
  return (
    <div className="ai-agent-memory-card">
      {proposals.length > 0 ? (
        <div className="ai-agent-memory-section">
          <strong>Remember this?</strong>
          {proposals.map(function (proposal) {
            return (
              <div key={proposal.id} className="ai-agent-proposal-row">
                <span>{proposal.fact}</span>
                <button
                  type="button"
                  onClick={function () {
                    onAcceptProposal(proposal.id);
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={function () {
                    onDismissProposal(proposal.id);
                  }}
                >
                  Dismiss
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="ai-agent-memory-section">
        <strong>Producer profile</strong>
        {profileFacts.length === 0 ? (
          <span className="ai-agent-memory-empty">
            Nothing remembered yet. Accept a suggestion above to keep it.
          </span>
        ) : (
          <>
            {profileFacts.map(function (fact) {
              return (
                <div key={fact} className="ai-agent-fact-row">
                  <span>{fact}</span>
                  <button
                    type="button"
                    aria-label={"Delete " + fact}
                    onClick={function () {
                      onDeleteFact(fact);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="ai-agent-memory-clear"
              onClick={onClearFacts}
            >
              Clear all
            </button>
          </>
        )}
      </div>

      <div className="ai-agent-memory-section">
        <strong>Notes for this project</strong>
        <input
          type="text"
          className="ai-agent-notes-label"
          key={projectNotesLabel}
          defaultValue={projectNotesLabel}
          placeholder="Project label"
          // Commits on blur/Enter, not per keystroke: switching labels
          // mid-typing would swap the visible notes out from under you.
          onBlur={function (event: FocusEvent<HTMLInputElement>) {
            const next = event.target.value.trim();
            if (next && next !== projectNotesLabel) {
              onProjectNotesLabelChange(next);
            }
          }}
          onKeyDown={function (event: KeyboardEvent<HTMLInputElement>) {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <textarea
          className="ai-agent-notes-area"
          value={projectNotes}
          placeholder="What should the agent remember about this project?"
          onChange={function (event: ChangeEvent<HTMLTextAreaElement>) {
            onProjectNotesChange(event.target.value);
          }}
        />
      </div>
    </div>
  );
}
