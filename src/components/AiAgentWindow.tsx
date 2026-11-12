import { useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from "react"
import { Bot } from "lucide-react";
import { AiAgentAttachments } from "./ai-agent/AiAgentAttachments";
import { AiAgentConversationList } from "./ai-agent/AiAgentConversationList";
import { AiAgentMemoryPanel } from "./ai-agent/AiAgentMemoryPanel";
import { AiAgentMessages } from "./ai-agent/AiAgentMessages";
import { AiAgentPlanPanel } from "./ai-agent/AiAgentPlanPanel";
import { AiAgentStreamStatus } from "./ai-agent/AiAgentStreamStatus";
import { useAiAgentController } from "./ai-agent/useAiAgentController";
import { parsePackDropPayload } from "../ai/aiAttachments";
import type { AiProviderModel } from "../types/ai"

interface AiAgentSelectProps {
  value: string
  options: readonly AiProviderModel[]
  onChange: (value: string) => void
}

function AiAgentSelect({ value, options, onChange }: AiAgentSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeOption = options.find(function (option) {
    return option.value === value;
  }) || options[0];

  return (
    <div className={"ai-agent-model-select rack-modern-select" + (isOpen ? " is-open" : "")}>
      <button
        type="button"
        className="rack-modern-select-trigger"
        onClick={function () {
          setIsOpen(function (current) {
            return !current;
          });
        }}
      >
        <span className="rack-modern-select-value">{activeOption?.label || "Select"}</span>
        <span className="rack-modern-select-caret">v</span>
      </button>
      {isOpen ? (
        <div className="rack-modern-select-dropdown">
          {options.map(function (option) {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={"rack-modern-select-option" + (isActive ? " is-active" : "")}
                onClick={function () {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AiAgentWindow() {
  const agent = useAiAgentController();
  // The plan panel is always mounted: hiding it until a plan exists
  // left the Apply button nowhere to be found — a model that answers
  // in text only made the whole apply flow invisible. The panel's
  // empty state explains the flow instead.
  return (
    <section className="ai-agent-shell">
      <div className="ai-agent-hero">
        <div className="ai-agent-avatar" aria-hidden="true">
          <Bot size={22} />
        </div>
        <div>
          <p className="ai-agent-kicker">Project assistant</p>
          <h2>AI Agent</h2>
        </div>
      </div>

      <div className="ai-agent-settings-card">
        <label>
          <span>Provider</span>
          <AiAgentSelect
            value={agent.provider}
            options={agent.providerOptions}
            onChange={agent.setProvider}
          />
        </label>
        <label>
          <span>{agent.providerLabel} API key</span>
          <input
            type="password"
            value={agent.apiKey}
            placeholder={agent.apiKeyPlaceholder}
            autoComplete="off"
            onChange={function (event: ChangeEvent<HTMLInputElement>) {
              agent.setApiKey(event.target.value);
            }}
          />
        </label>
        {agent.hasEndpointField ? (
          <label>
            <span>{agent.providerLabel} endpoint</span>
            <input
              type="url"
              value={agent.baseUrl}
              placeholder={agent.endpointPlaceholder}
              autoComplete="off"
              onChange={function (event: ChangeEvent<HTMLInputElement>) {
                agent.setBaseUrl(event.target.value);
              }}
            />
          </label>
        ) : null}
        <label>
          <span>Model</span>
          {agent.modelIsFreeText ? (
            <input
              type="text"
              value={agent.model}
              placeholder="Model name served by this endpoint"
              autoComplete="off"
              onChange={function (event: ChangeEvent<HTMLInputElement>) {
                agent.setModel(event.target.value);
              }}
            />
          ) : (
            <AiAgentSelect
              value={agent.model}
              options={agent.modelOptions}
              onChange={function (nextModel) {
                agent.setModel(nextModel);
              }}
            />
          )}
        </label>
        <label className="ai-agent-remember-key">
          <input
            type="checkbox"
            checked={agent.rememberKey}
            onChange={function (event: ChangeEvent<HTMLInputElement>) {
              agent.setRememberKey(event.target.checked);
            }}
          />
          <span>Remember on this device</span>
        </label>
        <div className="ai-agent-key-actions">
          <button
            type="button"
            onClick={agent.testConnection}
            disabled={agent.isTestingConnection || !agent.canTestConnection}
          >
            {agent.isTestingConnection ? "Testing..." : "Test connection"}
          </button>
        </div>
        {agent.connectionStatus ? (
          <div className="ai-agent-connection-status">
            {agent.connectionStatus}
          </div>
        ) : null}
      </div>

      <AiAgentMemoryPanel
        proposals={agent.memoryProposals}
        onAcceptProposal={agent.acceptMemoryProposal}
        onDismissProposal={agent.dismissMemoryProposal}
        profileFacts={agent.producerProfile}
        onDeleteFact={agent.deleteProfileFact}
        onClearFacts={agent.clearProfileFacts}
        projectNotesLabel={agent.projectNotesLabel}
        onProjectNotesLabelChange={agent.setProjectNotesLabel}
        projectNotes={agent.projectNotes}
        onProjectNotesChange={agent.setProjectNotes}
      />

      <div className="ai-agent-layout">
        <AiAgentConversationList
          conversations={agent.conversations}
          activeConversationId={agent.activeConversationId}
          onSelect={agent.selectConversation}
          onNew={agent.startNewConversation}
          onDelete={agent.deleteConversation}
          isLoading={agent.isLoadingConversations}
          isAuthenticated={agent.isAuthenticated}
        />

        <div className="ai-agent-chat-card">
          <AiAgentMessages messages={agent.messages} />

          {agent.error ? <div className="ai-agent-error">{agent.error}</div> : null}

          {agent.isSending && agent.streamingStartedAt !== null ? (
            <AiAgentStreamStatus
              streamingText={agent.streamingText}
              streamingStartedAt={agent.streamingStartedAt}
              streamingOpCount={agent.streamingOpCount}
              onCancel={agent.cancelSend}
            />
          ) : null}

          <form
            className="ai-agent-composer"
            onSubmit={agent.sendMessage}
            onDragOver={function (event: DragEvent<HTMLFormElement>) {
              event.preventDefault();
            }}
            onDrop={function (event: DragEvent<HTMLFormElement>) {
              event.preventDefault();
              if (event.dataTransfer.files.length > 0) {
                agent.addAttachmentFiles(event.dataTransfer.files);
                return;
              }
              // Packs-area drags carry no files — they carry a sample/MIDI
              // payload. Fetch it through the normal attachment path.
              const packDrop = parsePackDropPayload(event.dataTransfer);
              if (packDrop) {
                void agent.addAttachmentFromUrl(packDrop);
              }
            }}
          >
            <AiAgentAttachments
              attachments={agent.attachments}
              notices={agent.attachmentNotices}
              onAddFiles={agent.addAttachmentFiles}
              onRemove={agent.removeAttachment}
              disabled={agent.isSending}
            />
            <textarea
              value={agent.input}
              placeholder="Example: create a dark trap pattern with kick, snare and hats"
              disabled={agent.isSending}
              onChange={function (event: ChangeEvent<HTMLTextAreaElement>) {
                agent.setInput(event.target.value);
              }}
              onPaste={function (event: ClipboardEvent<HTMLTextAreaElement>) {
                const files = event.clipboardData?.files;
                if (files && files.length > 0) {
                  event.preventDefault();
                  agent.addAttachmentFiles(files);
                }
              }}
              onKeyDown={function (event: KeyboardEvent<HTMLTextAreaElement>) {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  agent.sendMessage(event);
                }
              }}
            />
            <button
              type="submit"
              disabled={
                agent.isSending
                || (!agent.input.trim() && agent.attachments.length === 0)
              }
            >
              {agent.isSending ? "Thinking..." : "Send"}
            </button>
          </form>
        </div>

        <AiAgentPlanPanel
          operations={agent.pendingOperations}
          operationResults={agent.operationResults}
          rejectedOperations={agent.rejectedOperations}
          lastReplyStagedNothing={agent.lastReplyStagedNothing}
          isApplying={agent.isApplying}
          onApply={agent.applyPendingOperations}
          onUndo={agent.undoLastAppliedChange}
          canUndo={agent.canUndoAppliedPlan}
        />
      </div>
    </section>
  );
}
