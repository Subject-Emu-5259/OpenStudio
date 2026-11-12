// Shared JSON parsing for AI agent plans.
//
// Small models often return a valid plan wrapped in
// prose, fenced in markdown, or with trailing commas. Strict parsing stays
// first, so well-formed responses are untouched; every step after it is a
// fallback that only runs when strict parsing already failed.

export interface AiPlanJson {
  message?: unknown
  operations?: unknown
  memory?: unknown
  brief?: unknown
}

// Lenient parsing for the optional memory proposals: only real strings
// survive, capped so a chatty model cannot flood the profile.
export function parseMemoryProposals(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(function (item) {
      return String(item || "").trim();
    })
    .filter(function (item) {
      return item.length > 0;
    })
    .slice(0, 10);
}

// Lenient parsing for the optional running brief: one trimmed string,
// capped so it stays a summary instead of a transcript.
export function parseConversationBrief(value: unknown): string {
  const brief = String(value || "").trim();
  if (!brief) {
    return "";
  }
  return brief.slice(0, 1000);
}

function extractBalancedObject(raw: string): string | null {
  const start = raw.indexOf("{")
  if (start < 0) {
    return null
  }

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === "\\") {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === "{") {
      depth++
    } else if (ch === "}") {
      depth--
      if (depth === 0) {
        return raw.slice(start, i + 1)
      }
    }
  }
  return null
}

function extractJsonCandidates(raw: string): string[] {
  const candidates: string[] = [raw]

  function pushCandidate(candidate: string | null) {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  // Fenced block: ```json {...} ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    pushCandidate(fenced[1].trim())
  }

  // First balanced object: prose before/after, or a second JSON block
  // after the plan, must not swallow the whole reply.
  pushCandidate(extractBalancedObject(raw))

  // Greedy span, the previous behavior: first "{" to last "}".
  const greedy = raw.match(/\{[\s\S]*\}/)
  if (greedy) {
    pushCandidate(greedy[0])
  }

  return candidates
}

export function parseAiPlanJson(content: unknown): AiPlanJson {
  const raw = String(content || "").trim()
  if (!raw) {
    // An empty reply is a message-only response with no plan, not a
    // crash: callers default the message and take operations as [].
    return {};
  }

  const candidates = extractJsonCandidates(raw)
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as AiPlanJson
    } catch {
      // Try the trailing-comma repair on the same candidate.
    }
    const repaired = candidate.replace(/,\s*([}\]])/g, "$1")
    if (repaired !== candidate) {
      try {
        return JSON.parse(repaired) as AiPlanJson
      } catch {
        // Fall through to the next candidate.
      }
    }
  }

  throw new Error("AI response was not valid JSON.")
}
