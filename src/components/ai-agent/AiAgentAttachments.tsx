import { useRef } from "react";
import type { ChangeEvent } from "react"
import { Paperclip } from "lucide-react";
import { formatAttachmentSize } from "../../ai/aiAttachments";
import type { AiAttachmentRecord } from "../../ai/aiAttachments";

interface AiAgentAttachmentsProps {
  attachments: AiAttachmentRecord[]
  notices: string[]
  onAddFiles: (files: FileList | File[]) => void
  onRemove: (attachmentId: string) => void
  disabled: boolean
}

function attachmentDetail(attachment: AiAttachmentRecord): string {
  const parts: string[] = [attachment.kind];
  if (attachment.durationSec !== undefined) {
    parts.push(attachment.durationSec.toFixed(1) + "s");
  }
  if (attachment.noteCount !== undefined) {
    parts.push(attachment.noteCount + " notes");
  }
  if (attachment.sourcePack) {
    parts.push("from " + attachment.sourcePack);
  }
  return parts.join(" · ");
}

export function AiAgentAttachments({
  attachments,
  notices,
  onAddFiles,
  onRemove,
  disabled,
}: AiAgentAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="ai-agent-attachments">
      <button
        type="button"
        className="ai-agent-attach-btn"
        title="Attach audio, MIDI, preset, or a ZIP pack"
        disabled={disabled}
        onClick={function () {
          fileInputRef.current?.click();
        }}
      >
        <Paperclip size={16} />
        <span>Attach</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".wav,.mp3,.flac,.mid,.midi,.json,.zip"
        hidden
        onChange={function (event: ChangeEvent<HTMLInputElement>) {
          if (event.target.files && event.target.files.length > 0) {
            onAddFiles(event.target.files);
          }
          event.target.value = "";
        }}
      />
      {attachments.map(function (attachment) {
        return (
          <span key={attachment.id} className="ai-agent-attachment-chip">
            <span className="ai-agent-attachment-name">{attachment.name}</span>
            <span className="ai-agent-attachment-meta">
              {attachmentDetail(attachment)} · {formatAttachmentSize(attachment.size)}
            </span>
            <button
              type="button"
              className="ai-agent-attachment-remove"
              aria-label={"Remove " + attachment.name}
              disabled={disabled}
              onClick={function () {
                onRemove(attachment.id);
              }}
            >
              ×
            </button>
          </span>
        );
      })}
      {notices.map(function (notice, index) {
        return (
          <span key={"notice-" + index} className="ai-agent-attachment-notice">
            {notice}
          </span>
        );
      })}
    </div>
  );
}
