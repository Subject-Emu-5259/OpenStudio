import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react"
import { useDispatch, useSelector, useStore } from "react-redux";
import {
  applyAiOperations,
} from "../../ai/aiAgentOperations";
import {
  AI_AGENT_DEFAULT_PROVIDER,
  AI_AGENT_PROVIDERS,
  AI_AGENT_PROVIDER_OPENROUTER,
  getAiProviderConfig,
  getAiProviderModel,
} from "../../ai/aiProviders";
import {
  describeAttachments,
  mergeSessionSamples,
  processAttachmentFiles,
  recordToStored,
  resolvePackFetchUrl,
  revokeAttachmentUrl,
  sessionSamplesFromAttachments,
  storedToRecord,
} from "../../ai/aiAttachments";
import type { AiAttachmentRecord } from "../../ai/aiAttachments";
import { AiAttachmentStore } from "../../ai/aiAttachmentStore";
import { requestPlanWithRepair } from "../../ai/aiPlanRepair";
import { buildAiProjectSummary } from "../../ai/aiProjectSummary";
import { fetchProjects } from "../../lib/projectApi";
import { loadAiSampleIndex, searchAiSamples } from "../../ai/aiSampleIndex";
import { isAbortError, requestAiAgentPlan, testAiConnection } from "../../ai/aiClient";
import {
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchConversations,
  loadConversation,
  updateConversation,
} from "../../lib/aiConversationsApi";
import { loadProjectFromFile } from "../../store";
import type {
  AiChatMessage,
  AiConversation,
  AiConversationSummary,
  AiMemoryProposal,
  AiOperationResult,
  AiPreparedOperation,
  AiProviderId,
  AiRejectedOperation,
  AiSample,
} from "../../types/ai"
import type { DawState } from "../../types/daw"

const AI_AGENT_PROVIDER_STORAGE = "openstudio.ai.provider";
const AI_AGENT_LEGACY_OPENAI_KEY_STORAGE = "openstudio.ai.openaiKey";
const AI_AGENT_LEGACY_MODEL_STORAGE = "openstudio.ai.model";

// Max characters for the auto-generated conversation title.
const TITLE_MAX_LENGTH = 50;

// Local-first memory layers (never sign-in-gated, never sent to a server
// except as model context): the producer profile, per-label project notes,
// and per-conversation running briefs.
const PRODUCER_PROFILE_STORAGE = "openstudio.ai.producerProfile";
const PROJECT_NOTES_STORAGE = "openstudio.ai.projectNotes";
const CONVERSATION_BRIEF_PREFIX = "openstudio.ai.brief.";
const PRODUCER_PROFILE_MAX_FACTS = 30;
const PROJECT_NOTES_DEFAULT_LABEL = "Untitled project";

// History sent to the model is capped at the last 20 exchanges (40 chat
// messages). Older turns are not sent again; the running brief stands in
// for them when one exists.
const HISTORY_MAX_TURNS = 20;

// One attachment store per page load; IndexedDB with memory fallback.
const attachmentStore = new AiAttachmentStore();

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked in privacy modes; memory state still works.
  }
}

function readProducerProfile(): string[] {
  const stored = readStoredJson<{ facts?: unknown }>(
    PRODUCER_PROFILE_STORAGE,
    { facts: [] },
  );
  const facts = Array.isArray(stored?.facts) ? stored.facts : [];
  return facts
    .map(function (fact) {
      return String(fact || "").trim();
    })
    .filter(function (fact) {
      return fact.length > 0;
    })
    .slice(0, PRODUCER_PROFILE_MAX_FACTS);
}

function readProjectNotesMap(): Record<string, string> {
  const stored = readStoredJson<Record<string, unknown>>(
    PROJECT_NOTES_STORAGE,
    {},
  );
  const result: Record<string, string> = {};
  if (stored && typeof stored === "object") {
    Object.keys(stored).forEach(function (label) {
      const notes = stored[label];
      if (typeof notes === "string") {
        result[label] = notes;
      }
    });
  }
  return result;
}

function readConversationBrief(conversationId: string): string {
  if (typeof window === "undefined" || !conversationId) {
    return "";
  }
  try {
    return window.localStorage.getItem(
      CONVERSATION_BRIEF_PREFIX + conversationId,
    ) || "";
  } catch {
    return "";
  }
}

function writeConversationBrief(conversationId: string, brief: string): void {
  if (typeof window === "undefined" || !conversationId) {
    return;
  }
  try {
    if (brief) {
      window.localStorage.setItem(CONVERSATION_BRIEF_PREFIX + conversationId, brief);
    } else {
      window.localStorage.removeItem(CONVERSATION_BRIEF_PREFIX + conversationId);
    }
  } catch {
    // Non-fatal: the in-memory brief still works for this session.
  }
}

interface DawStore {
  getState: () => { daw: DawState }
  dispatch: (action: unknown) => unknown
}

function readStoredValue(key: string, fallback = ""): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked in privacy modes; the in-memory key still works.
  }
}

function readStoredProvider(): AiProviderId {
  const storedProvider = readStoredValue(
    AI_AGENT_PROVIDER_STORAGE,
    AI_AGENT_DEFAULT_PROVIDER,
  );
  return getAiProviderConfig(storedProvider).id;
}

function readProviderKey(providerId: string): string {
  const provider = getAiProviderConfig(providerId);
  const storedKey = readStoredValue(provider.keyStorage);
  if (storedKey) {
    return storedKey;
  }
  if (provider.id === "openai") {
    return readStoredValue(AI_AGENT_LEGACY_OPENAI_KEY_STORAGE);
  }
  return "";
}

function readProviderModel(providerId: string): string {
  const provider = getAiProviderConfig(providerId);
  const storedModel =
    readStoredValue(provider.modelStorage) ||
    (provider.id === "openai"
      ? readStoredValue(AI_AGENT_LEGACY_MODEL_STORAGE)
      : "");
  return getAiProviderModel(provider.id, storedModel);
}

function readProviderEndpoint(providerId: string): string {
  const provider = getAiProviderConfig(providerId);
  if (!provider.endpointStorage) {
    return "";
  }
  return readStoredValue(provider.endpointStorage) || provider.defaultEndpoint || "";
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Derives a short title from the first user message, truncated on a word
 * boundary so the title does not cut mid-word.
 */
function deriveTitle(firstMessage: string): string {
  const raw = String(firstMessage || "").trim();
  if (!raw) {
    return "New chat";
  }
  if (raw.length <= TITLE_MAX_LENGTH) {
    return raw;
  }
  const slice = raw.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 20 ? slice.slice(0, lastSpace) : slice) + "...";
}

/**
 * Best-effort count of operations in a partial plan JSON stream. The
 * text is mid-generation, so it is usually not valid JSON yet — parsing
 * it would fail more often than not. Every operation object carries a
 * "type" key, so counting those is a stable-enough progress signal.
 * The count is a lower bound early on (an operation whose "type" key
 * has not arrived yet is not counted) and exact once the plan is
 * complete.
 */
function countStreamedOperations(partialText: string): number {
  const matches = String(partialText || "").match(/"type"\s*:/g);
  return matches ? matches.length : 0;
}

export function useAiAgentController() {
  const dispatch = useDispatch() as DawStore["dispatch"];
  const store = useStore() as unknown as DawStore;
  const currentUser = useSelector(function (state: { user: { currentUser: unknown } }) {
    return state.user.currentUser;
  });
  const isAuthenticated = Boolean(currentUser);
  const [provider, setProviderState] = useState<AiProviderId>(readStoredProvider);

  const [apiKey, setApiKey] = useState(function () {
    return readProviderKey(provider);
  });
  const [rememberKey, setRememberKey] = useState(function () {
    return Boolean(readProviderKey(provider));
  });
  const [model, setModel] = useState(function () {
    return readProviderModel(provider);
  });
  const [baseUrl, setBaseUrl] = useState(function () {
    return readProviderEndpoint(provider);
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pendingOperations, setPendingOperations] = useState<AiPreparedOperation[]>([]);
  const [operationResults, setOperationResults] = useState<AiOperationResult[]>([]);
  const [rejectedOperations, setRejectedOperations] = useState<AiRejectedOperation[]>([]);
  // True when the latest assistant reply staged nothing at all — no
  // valid operations and no rejections, just message text. The plan
  // panel uses it to say so plainly instead of leaving the user
  // staring at an empty panel wondering why nothing happened.
  const [lastReplyStagedNothing, setLastReplyStagedNothing] = useState(false);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Streaming progress: the partial plan text so far, when the stream
  // started (for the elapsed timer), and a best-effort operation count.
  // All three reset when the send ends, for any reason. isSending stays
  // the coarse flag; these only describe the in-flight stream.
  const [streamingText, setStreamingText] = useState("");
  const [streamingStartedAt, setStreamingStartedAt] = useState<number | null>(null);
  const [streamingOpCount, setStreamingOpCount] = useState(0);
  // The in-flight send's AbortController; Cancel aborts it. A ref, not
  // state — aborting must not re-render.
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [canUndoAppliedPlan, setCanUndoAppliedPlan] = useState(false);
  const appliedPlanSnapshotsRef = useRef<DawState[]>([]);

  // Conversation history (Supabase-backed, authenticated users only)
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Phase 1: session attachments (restored from IndexedDB on open).
  const [attachments, setAttachments] = useState<AiAttachmentRecord[]>([]);
  const [attachmentNotices, setAttachmentNotices] = useState<string[]>([]);

  // Phase 3: local-first memory — producer profile, project notes, and
  // the running brief for the active conversation.
  const [memoryProposals, setMemoryProposals] = useState<AiMemoryProposal[]>([]);
  const [producerProfile, setProducerProfile] = useState<string[]>(readProducerProfile);
  const [projectNotesLabel, setProjectNotesLabelState] = useState(
    PROJECT_NOTES_DEFAULT_LABEL,
  );
  const [projectNotes, setProjectNotesState] = useState("");
  const [conversationBrief, setConversationBrief] = useState("");

  // Phase 4: past cloud project titles (signed-in only, best-effort).
  const [pastProjects, setPastProjects] = useState<string[]>([]);

  // Restore attachments from the local store when the agent opens.
  useEffect(function () {
    let cancelled = false;
    attachmentStore
      .getAll()
      .then(function (stored) {
        if (cancelled) {
          return;
        }
        setAttachments(stored.map(function (item) {
          return storedToRecord(item);
        }));
      })
      .catch(function () {
        // Non-fatal: the session just starts without restored files.
      });
    return function () {
      cancelled = true;
    };
  }, []);

  // Aborting on unmount keeps a slow stream from resolving into a
  // torn-down window (and from burning provider tokens after the user
  // has closed the agent).
  useEffect(function () {
    const controllerRef = sendAbortControllerRef;
    return function () {
      controllerRef.current?.abort();
    };
  }, []);

  // Restore project notes for the default label on open.
  useEffect(function () {
    const notesMap = readProjectNotesMap();
    setProjectNotesState(notesMap[PROJECT_NOTES_DEFAULT_LABEL] || "");
  }, []);

  // Past project titles for signed-in users only; failures are silent
  // because this is a convenience, not a requirement for chatting.
  useEffect(
    function () {
      if (!isAuthenticated) {
        setPastProjects([]);
        return;
      }
      let cancelled = false;
      fetchProjects()
        .then(function (projects) {
          if (cancelled) {
            return;
          }
          setPastProjects(
            (Array.isArray(projects) ? projects : [])
              .map(function (project) {
                return String(project?.name || "").trim();
              })
              .filter(function (name) {
                return name.length > 0;
              })
              .slice(0, 50),
          );
        })
        .catch(function () {
          // Silent: past projects are optional context.
        });
      return function () {
        cancelled = true;
      };
    },
    [isAuthenticated],
  );

  // Persist the producer profile whenever it changes.
  useEffect(
    function () {
      writeStoredJson(PRODUCER_PROFILE_STORAGE, { facts: producerProfile });
    },
    [producerProfile],
  );

  const addAttachmentFiles = useCallback(
    async function (files: FileList | File[]) {
      const list = Array.from(files || []);
      if (list.length === 0) {
        return;
      }
      try {
        const result = await processAttachmentFiles(list);
        if (result.records.length > 0) {
          setAttachments(function (current) {
            return current.concat(result.records);
          });
          result.records.forEach(function (record) {
            attachmentStore.put(recordToStored(record)).catch(function () {
              // Non-fatal: the session copy still works.
            });
          });
        }
        const notices = result.skipped.slice(0, 8).map(function (skipped) {
          return "Skipped " + skipped.name + ": " + skipped.reason;
        });
        if (result.skipped.length > 8) {
          notices.push(
            "...and " + (result.skipped.length - 8) + " more files skipped.",
          );
        }
        if (notices.length > 0) {
          setAttachmentNotices(function (current) {
            return current.concat(notices);
          });
        }
      } catch {
        setAttachmentNotices(function (current) {
          return current.concat(["Could not read the attached files."]);
        });
      }
    },
    [],
  );

  const removeAttachment = useCallback(
    function (attachmentId: string) {
      setAttachments(function (current) {
        const removed = current.find(function (item) {
          return item.id === attachmentId;
        });
        if (removed) {
          revokeAttachmentUrl(removed);
        }
        return current.filter(function (item) {
          return item.id !== attachmentId;
        });
      });
      attachmentStore.remove(attachmentId).catch(function () {
        // Non-fatal: the session copy is already gone.
      });
    },
    [],
  );

  // Pack-area drags land here as a parsed payload (name + pack URL). The
  // file is fetched and fed through the normal file-attachment path, so a
  // dragged loop or MIDI gets the same decode, chip, and IDB backup as a
  // pasted file. Fetch failures surface as a notice, never a crash.
  const addAttachmentFromUrl = useCallback(
    async function (drop: { name: string; url: string }) {
      const target = drop && drop.name ? String(drop.name) : "";
      const fetchUrl = resolvePackFetchUrl(drop ? drop.url : "");
      if (!target || !fetchUrl) {
        return;
      }
      try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error("Pack file could not be loaded.");
        }
        const blob = await response.blob();
        await addAttachmentFiles([
          new File([blob], target, { type: blob.type }),
        ]);
      } catch {
        setAttachmentNotices(function (current) {
          return current.concat([
            "Could not load " + target + " from the pack.",
          ]);
        });
      }
    },
    [addAttachmentFiles],
  );

  const acceptMemoryProposal = useCallback(
    function (proposalId: string) {
      setMemoryProposals(function (current) {
        const proposal = current.find(function (item) {
          return item.id === proposalId;
        });
        if (proposal) {
          setProducerProfile(function (facts) {
            if (facts.includes(proposal.fact)) {
              return facts;
            }
            return facts.concat(proposal.fact).slice(0, PRODUCER_PROFILE_MAX_FACTS);
          });
        }
        return current.filter(function (item) {
          return item.id !== proposalId;
        });
      });
    },
    [],
  );

  const dismissMemoryProposal = useCallback(
    function (proposalId: string) {
      setMemoryProposals(function (current) {
        return current.filter(function (item) {
          return item.id !== proposalId;
        });
      });
    },
    [],
  );

  const deleteProfileFact = useCallback(
    function (fact: string) {
      setProducerProfile(function (current) {
        return current.filter(function (item) {
          return item !== fact;
        });
      });
    },
    [],
  );

  const clearProfileFacts = useCallback(
    function () {
      setProducerProfile([]);
    },
    [],
  );

  const setProjectNotesLabel = useCallback(
    function (nextLabel: string) {
      const label = String(nextLabel || "").trim() || PROJECT_NOTES_DEFAULT_LABEL;
      const notesMap = readProjectNotesMap();
      notesMap[projectNotesLabel] = projectNotes;
      writeStoredJson(PROJECT_NOTES_STORAGE, notesMap);
      setProjectNotesLabelState(label);
      setProjectNotesState(notesMap[label] || "");
    },
    [projectNotesLabel, projectNotes],
  );

  const setProjectNotes = useCallback(
    function (nextNotes: string) {
      const notes = String(nextNotes || "");
      setProjectNotesState(notes);
      const notesMap = readProjectNotesMap();
      notesMap[projectNotesLabel] = notes;
      writeStoredJson(PROJECT_NOTES_STORAGE, notesMap);
    },
    [projectNotesLabel],
  );

  useEffect(
    function () {
      const providerConfig = getAiProviderConfig(provider);
      writeStoredValue(
        providerConfig.modelStorage,
        getAiProviderModel(providerConfig.id, model),
      );
    },
    [model, provider],
  );

  useEffect(
    function () {
      const providerConfig = getAiProviderConfig(provider);
      writeStoredValue(providerConfig.keyStorage, rememberKey ? apiKey : "");
    },
    [apiKey, rememberKey, provider],
  );

  useEffect(
    function () {
      const providerConfig = getAiProviderConfig(provider);
      if (providerConfig.endpointStorage) {
        writeStoredValue(providerConfig.endpointStorage, baseUrl);
      }
    },
    [baseUrl, provider],
  );

  const setProvider = useCallback(
    function (nextProvider: string) {
      const currentProviderConfig = getAiProviderConfig(provider);
      writeStoredValue(
        currentProviderConfig.keyStorage,
        rememberKey ? apiKey : "",
      );
      if (currentProviderConfig.endpointStorage) {
        writeStoredValue(currentProviderConfig.endpointStorage, baseUrl);
      }

      const nextProviderConfig = getAiProviderConfig(nextProvider);
      const nextProviderId = nextProviderConfig.id;
      const nextKey = readProviderKey(nextProviderId);

      writeStoredValue(AI_AGENT_PROVIDER_STORAGE, nextProviderId);
      setProviderState(nextProviderId);
      setApiKey(nextKey);
      setRememberKey(Boolean(nextKey));
      setModel(readProviderModel(nextProviderId));
      setBaseUrl(readProviderEndpoint(nextProviderId));
      setConnectionStatus("");
      setError("");
    },
    [apiKey, baseUrl, provider, rememberKey],
  );

  // Load conversation list when the user signs in; clear when signed out.
  const refreshConversations = useCallback(
    async function () {
      if (!isAuthenticated) {
        setConversations([]);
        setActiveConversationId(null);
        return;
      }

      setIsLoadingConversations(true);
      try {
        const list = await fetchConversations();
        setConversations(list);
      } catch {
        // Non-fatal: the chat still works without persisted history.
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(
    function () {
      refreshConversations();
    },
    [refreshConversations],
  );

  const startNewConversation = useCallback(function () {
    appliedPlanSnapshotsRef.current = [];
    setCanUndoAppliedPlan(false);
    setActiveConversationId(null);
    setMessages([]);
    setPendingOperations([]);
    setOperationResults([]);
    setRejectedOperations([]);
    setLastReplyStagedNothing(false);
    setMemoryProposals([]);
    setConversationBrief("");
    setError("");
  }, []);

  const selectConversation = useCallback(
    async function (conversationId: string) {
      if (!conversationId) {
        return;
      }

      setIsLoadingConversations(true);
      try {
        const convo = await loadConversation(conversationId) as AiConversation | null;
        if (!convo) {
          return;
        }

        setActiveConversationId(conversationId);
        setMessages(Array.isArray(convo.messages) ? convo.messages : []);
        setMemoryProposals([]);
        setConversationBrief(readConversationBrief(conversationId));
        setPendingOperations(
          Array.isArray(convo.pending_operations)
            ? convo.pending_operations
            : [],
        );
        setOperationResults(
          Array.isArray(convo.operation_results)
            ? convo.operation_results
            : [],
        );
        setRejectedOperations(
          Array.isArray(convo.rejected_operations)
            ? convo.rejected_operations
            : [],
        );
        setLastReplyStagedNothing(false);
        appliedPlanSnapshotsRef.current = [];
        setCanUndoAppliedPlan(false);
        setError("");
      } catch {
        // If load fails, stay on the current conversation.
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [],
  );

  const deleteConversation = useCallback(
    async function (conversationId: string) {
      if (!conversationId) {
        return;
      }

      try {
        await deleteConversationApi(conversationId);
        setConversations(function (current) {
          return current.filter(function (item) {
            return item.id !== conversationId;
          });
        });
        if (conversationId === activeConversationId) {
          startNewConversation();
        }
      } catch {
        // Non-fatal: keep the conversation in the list if delete fails.
      }
    },
    [activeConversationId, startNewConversation],
  );

  // One stream update: the partial plan text plus the operation count
  // so far. Shared by the plan request and the repair retry, which
  // restarts the stream (onDelta("") clears the previous attempt).
  const handleStreamDelta = useCallback(function (partialText: string) {
    setStreamingText(partialText);
    setStreamingOpCount(countStreamedOperations(partialText));
  }, []);

  // Cancels the in-flight plan request. The abort rejects the request
  // with an AbortError, which the send catch treats as a quiet cancel;
  // the finally block resets the streaming state. Resetting here too
  // makes the status area disappear the moment Cancel is clicked,
  // instead of waiting for the abort to propagate.
  const cancelSend = useCallback(function () {
    sendAbortControllerRef.current?.abort();
    setStreamingText("");
    setStreamingStartedAt(null);
    setStreamingOpCount(0);
  }, []);

  const sendMessage = async function (
    event?: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLTextAreaElement>,
  ): Promise<void> {
    event?.preventDefault();

    // Attachments alone are a message: "use the attached files."
    const userMessage = String(input || "").trim()
      || (attachments.length > 0 ? "Use the attached files." : "");
    if (!userMessage || isSending) {
      return;
    }

    setError("");
    setInput("");
    setIsSending(true);
    // Streaming state: the status area shows the plan arriving, and the
    // AbortController is what Cancel aborts. Both reset in the finally
    // below, so a completed, failed, or cancelled send leaves no trace.
    const abortController = new AbortController();
    sendAbortControllerRef.current = abortController;
    setStreamingText("");
    setStreamingOpCount(0);
    setStreamingStartedAt(Date.now());
    setPendingOperations([]);
    setOperationResults([]);
    setRejectedOperations([]);
    setLastReplyStagedNothing(false);

    // Snapshot the conversation history before adding the new user message,
    // so the API receives prior turns as context (works for loaded chats
    // too). Capped at the last 20 exchanges; the brief stands in for
    // anything older.
    const conversationHistory = messages.slice(-HISTORY_MAX_TURNS * 2);

    setMessages(function (current) {
      return current.concat({ role: "user", content: userMessage });
    });

    try {
      const allSamples: AiSample[] = await loadAiSampleIndex(800);
      // Always send a broad sample catalog so the agent knows what's
      // available without the user having to mention specific names.
      const searched = searchAiSamples(allSamples, userMessage, 120);
      const baseAvailable = searched.length >= 20
        ? searched
        : allSamples.slice(0, 200);
      // Session attachments first: the model sees them in availableSamples
      // under folder "Attachments", and validation accepts their paths.
      const sessionSamples = sessionSamplesFromAttachments(attachments);
      const availableSamples = mergeSessionSamples(baseAvailable, sessionSamples);
      const currentDawState = store.getState().daw;
      const projectSummary = buildAiProjectSummary(
        currentDawState,
        availableSamples,
      );
      const attachmentDescriptors = describeAttachments(attachments);
      const repaired = await requestPlanWithRepair({
        request: function (message: string) {
          return requestAiAgentPlan(
            {
              provider,
              apiKey,
              model,
              baseUrl: baseUrl.trim()
                ? baseUrl
                : (getAiProviderConfig(provider).defaultEndpoint || ""),
              userMessage: message,
              projectSummary,
              conversationHistory,
              attachments: attachmentDescriptors,
              producerProfile,
              projectNotes,
              conversationBrief,
              pastProjects,
            },
            {
              signal: abortController.signal,
              onDelta: handleStreamDelta,
            },
          );
        },
        userMessage,
        dawState: currentDawState,
        availableSamples,
        // Repair reuses the same stream options so a retry restarts
        // the partial text instead of splicing two plans together.
        streamOptions: {
          signal: abortController.signal,
          onDelta: handleStreamDelta,
        },
      });
      const response = repaired.response;
      const validatedOperations = repaired.validatedOperations;

      setPendingOperations(validatedOperations);
      setRejectedOperations(repaired.rejected);
      setLastReplyStagedNothing(
        validatedOperations.length === 0 && repaired.rejected.length === 0,
      );

      // Running brief: the model's latest summary replaces the old one
      // and is kept locally per conversation (no Supabase schema change).
      const nextBrief = response.brief || "";
      if (nextBrief) {
        setConversationBrief(nextBrief);
      }

      // Memory proposals: model suggestions only — nothing enters the
      // profile until the user accepts it in the window.
      const newProposals = (Array.isArray(response.memory) ? response.memory : [])
        .map(function (fact) {
          return String(fact || "").trim();
        })
        .filter(function (fact) {
          return fact.length > 0
            && !producerProfile.includes(fact)
            && !memoryProposals.some(function (proposal) {
              return proposal.fact === fact;
            });
        })
        .map(function (fact, index) {
          return {
            id: "mem-" + Date.now().toString(36) + "-" + index,
            fact,
          };
        });
      if (newProposals.length > 0) {
        setMemoryProposals(function (current) {
          return current.concat(newProposals);
        });
      }

      const assistantMessage: AiChatMessage = {
        role: "assistant",
        content: response.message,
      };
      const updatedMessages: AiChatMessage[] = messages.concat(
        { role: "user", content: userMessage },
        assistantMessage,
      );
      setMessages(updatedMessages);

      // Persist to Supabase if the user is authenticated.
      if (isAuthenticated) {
        if (!activeConversationId) {
          const created = await createConversation({
            title: deriveTitle(userMessage),
            messages: updatedMessages,
            pendingOperations: validatedOperations,
            operationResults: [],
            rejectedOperations: repaired.rejected,
          }) as AiConversation;
          setActiveConversationId(created.id);
          if (nextBrief) {
            writeConversationBrief(created.id, nextBrief);
          }
          setConversations(function (current) {
            return [
              {
                id: created.id,
                title: created.title,
                created_at: created.created_at,
                updated_at: created.updated_at,
              },
            ].concat(current);
          });
        } else {
          await updateConversation(activeConversationId, {
            messages: updatedMessages,
            pendingOperations: validatedOperations,
            operationResults: [],
            rejectedOperations: repaired.rejected,
          });
          if (nextBrief) {
            writeConversationBrief(activeConversationId, nextBrief);
          }
          setConversations(function (current) {
            return current.map(function (item) {
              if (item.id !== activeConversationId) {
                return item;
              }
              return Object.assign({}, item, {
                updated_at: new Date().toISOString(),
              });
            });
          });
        }
      }
    } catch (sendError) {
      if (isAbortError(sendError)) {
        // A user cancel is not a failure: no error banner, no "could
        // not prepare a plan" reply — just a note that the send stopped.
        setMessages(function (current) {
          return current.concat({
            role: "system",
            content: "Request cancelled.",
          });
        });
      } else {
        const message = getErrorMessage(sendError);
        setError(message);
        setMessages(function (current) {
          return current.concat({
            role: "assistant",
            content: "I could not prepare a plan: " + message,
          });
        });
      }
    } finally {
      setIsSending(false);
      setStreamingText("");
      setStreamingStartedAt(null);
      setStreamingOpCount(0);
      sendAbortControllerRef.current = null;
    }
  };

  const applyPendingOperations = function () {
    if (pendingOperations.length === 0 || isApplying) {
      return;
    }

    setIsApplying(true);
    appliedPlanSnapshotsRef.current.push(cloneSerializable(store.getState().daw));
    setCanUndoAppliedPlan(true);
    const result = applyAiOperations(pendingOperations, {
      dispatch,
      getState: store.getState,
    });
    setOperationResults(result.results);
    setPendingOperations([]);
    setRejectedOperations([]);

    const systemMessage: AiChatMessage = {
      role: "system",
      content:
        "Applied " +
        result.applied.length +
        " operation" +
        (result.applied.length === 1 ? "" : "s") +
        (result.skipped.length > 0
          ? ". Skipped " + result.skipped.length + "."
          : "."),
    };
    const updatedMessages: AiChatMessage[] = messages.concat(systemMessage);
    setMessages(updatedMessages);

    // Persist the applied state to Supabase.
    if (isAuthenticated && activeConversationId) {
      (updateConversation(activeConversationId, {
        messages: updatedMessages,
        pendingOperations: [],
        operationResults: result.results,
        rejectedOperations: [],
      }) as Promise<AiConversation>)
        .then(function (updated: AiConversation) {
          setConversations(function (current) {
            return current.map(function (item) {
              if (item.id !== activeConversationId) {
                return item;
              }
              return Object.assign({}, item, {
                updated_at: updated.updated_at,
              });
            });
          });
        })
        .catch(function () {
          // Non-fatal: the operations are already applied in Redux.
        });
    }

    setIsApplying(false);
  };

  const testConnection = async function () {
    if (isTestingConnection) {
      return;
    }

    setError("");
    setConnectionStatus("");
    setIsTestingConnection(true);

    try {
      const result = await testAiConnection({
        provider,
        apiKey,
        model,
        baseUrl: baseUrl.trim()
          ? baseUrl
          : (getAiProviderConfig(provider).defaultEndpoint || ""),
      });
      const providerLabel = getAiProviderConfig(provider).label;
      setConnectionStatus("Connected to " + providerLabel + " " + result.model + ".");
    } catch (testError) {
      const message = getErrorMessage(testError);
      setError(message);
      setConnectionStatus("");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const undoLastAppliedChange = function () {
    const snapshot = appliedPlanSnapshotsRef.current.pop();
    if (!snapshot) {
      setCanUndoAppliedPlan(false);
      return;
    }

    dispatch(loadProjectFromFile(snapshot));
    setCanUndoAppliedPlan(appliedPlanSnapshotsRef.current.length > 0);
  };

  return {
    provider,
    setProvider,
    providerOptions: AI_AGENT_PROVIDERS.map(function (item) {
      return { value: item.id, label: item.label };
    }),
    providerLabel: getAiProviderConfig(provider).label,
    apiKeyPlaceholder: getAiProviderConfig(provider).keyPlaceholder,
    apiKey,
    setApiKey,
    rememberKey,
    setRememberKey,
    model,
    setModel,
    modelOptions: getAiProviderConfig(provider).models,
    modelIsFreeText: getAiProviderConfig(provider).models.length === 0,
    baseUrl,
    setBaseUrl,
    hasEndpointField: Boolean(getAiProviderConfig(provider).endpointStorage),
    endpointPlaceholder: getAiProviderConfig(provider).endpointPlaceholder || "",
    // OpenAI/Gemini need a key; an endpoint provider needs its URL —
    // falling back to its preset when the field was cleared.
    // A key alone never enables testing a custom endpoint with no URL.
    // OpenRouter needs its key too (unlike local compatible servers).
    canTestConnection: getAiProviderConfig(provider).endpointStorage
      ? Boolean(
          (baseUrl || getAiProviderConfig(provider).defaultEndpoint || "").trim(),
        ) && (provider !== AI_AGENT_PROVIDER_OPENROUTER || Boolean(apiKey.trim()))
      : Boolean(apiKey.trim()),
    input,
    setInput,
    messages,
    pendingOperations,
    operationResults,
    rejectedOperations,
    lastReplyStagedNothing,
    error,
    connectionStatus,
    isSending,
    streamingText,
    streamingStartedAt,
    streamingOpCount,
    cancelSend,
    isApplying,
    isTestingConnection,
    sendMessage,
    applyPendingOperations,
    testConnection,
    undoLastAppliedChange,
    canUndoAppliedPlan,
    isAuthenticated,
    conversations,
    activeConversationId,
    isLoadingConversations,
    selectConversation,
    startNewConversation,
    deleteConversation,
    attachments,
    attachmentNotices,
    addAttachmentFiles,
    addAttachmentFromUrl,
    removeAttachment,
    memoryProposals,
    acceptMemoryProposal,
    dismissMemoryProposal,
    producerProfile,
    deleteProfileFact,
    clearProfileFacts,
    projectNotesLabel,
    setProjectNotesLabel,
    projectNotes,
    setProjectNotes,
  };
}
