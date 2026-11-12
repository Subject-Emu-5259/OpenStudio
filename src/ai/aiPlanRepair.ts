import { prepareAiOperations, validatePreparedAiOperations } from "./aiAgentOperations";
import { isAbortError } from "./aiClient";
import type { AiPlanStreamOptions } from "./aiClient";
import type {
  AiAgentPlan,
  AiPreparedOperation,
  AiRawOperation,
  AiRejectedOperation,
} from "../types/ai";

// Plan repair: when the model's first plan has rejected operations, retry
// ONCE with the rejections spelled out, and keep whichever result has
// fewer rejections. When the first plan stages NOTHING (no valid ops,
// no rejections — a text-only reply), retry ONCE with a nudge to return
// the operations for a build request. Never loops, never throws — a
// failed repair just keeps the first result. The retry reuses the
// caller's request function, so it carries the same history, brief,
// project, and attachments. The empty-plan retry costs one extra call
// on genuine questions too (the model answers the same way twice and
// the first answer is kept) — worth it, because a build request that
// comes back empty otherwise fails silently.

export const AI_PLAN_REPAIR_MAX_LISTED = 20;
const AI_PLAN_REPAIR_OPERATION_PREVIEW = 500;

function previewOperation(operation: AiRawOperation | undefined): string {
  if (!operation) {
    return "(missing)";
  }
  const json = JSON.stringify(operation);
  if (json.length <= AI_PLAN_REPAIR_OPERATION_PREVIEW) {
    return json;
  }
  return json.slice(0, AI_PLAN_REPAIR_OPERATION_PREVIEW) + "...";
}

export function buildRepairMessage(
  rejected: AiRejectedOperation[],
  rawOperations: AiRawOperation[],
): string {
  const lines = (Array.isArray(rejected) ? rejected : [])
    .slice(0, AI_PLAN_REPAIR_MAX_LISTED)
    .map(function (item) {
      return (
        "- Operation " +
        item.index +
        " rejected: " +
        item.reason +
        " — it was: " +
        previewOperation(rawOperations[item.index])
      );
    });
  return (
    "Your previous plan was rejected in part. Return a complete corrected " +
    "plan (message + operations) that fixes ONLY the rejected operations " +
    "below. Do not repeat a rejected operation unchanged, and do not drop " +
    "the valid operations from the previous plan.\n" +
    lines.join("\n")
  );
}

export function buildEmptyPlanMessage(): string {
  return (
    "Your previous reply contained no operations, so nothing was staged. "
    + "If the user asked you to build or change something, return a "
    + "complete plan (message + operations) for it now. If they asked a "
    + "question, answer it the same way."
  );
}

export interface AiPlanRepairRequest {
  // Sends a user message to the model and returns its plan. The caller
  // closes over history, brief, project, and attachments, so the repair
  // attempt sees exactly what the first attempt saw.
  request: (userMessage: string) => Promise<AiAgentPlan>
  userMessage: string
  dawState: unknown
  availableSamples: unknown
  // Streaming options for the plan request. The signal travels inside
  // the request closure; repair only uses onDelta, to clear the first
  // attempt's partial text before the retry stream starts — otherwise
  // the UI would show two plans spliced together.
  streamOptions?: AiPlanStreamOptions
}

export interface AiPlanRepairResult {
  response: AiAgentPlan
  validatedOperations: AiPreparedOperation[]
  rejected: AiRejectedOperation[]
  repaired: boolean
}

export async function requestPlanWithRepair({
  request,
  userMessage,
  dawState,
  availableSamples,
  streamOptions,
}: AiPlanRepairRequest): Promise<AiPlanRepairResult> {
  const firstResponse = await request(userMessage);
  const firstPrepared = prepareAiOperations(firstResponse.operations);
  const firstValidated = validatePreparedAiOperations(firstPrepared.operations, {
    dawState,
    availableSamples,
  });

  // Empty plan: nothing staged at all — the model answered in text
  // only. A build request deserves one more chance; a question just
  // gets answered twice and the first answer is kept.
  const firstEmpty = firstValidated.length === 0
    && firstPrepared.rejected.length === 0;

  if (firstPrepared.rejected.length === 0 && !firstEmpty) {
    return {
      response: firstResponse,
      validatedOperations: firstValidated,
      rejected: firstPrepared.rejected,
      repaired: false,
    };
  }

  let secondResponse: AiAgentPlan;
  try {
    // The retry is a fresh stream: clear the first attempt's partial
    // text first, or the UI splices two plans together.
    streamOptions?.onDelta?.("");
    secondResponse = await request(
      firstEmpty
        ? buildEmptyPlanMessage()
        : buildRepairMessage(firstPrepared.rejected, firstResponse.operations),
    );
  } catch (repairError) {
    // A user cancel is not a failed repair: rethrow it so the caller
    // can end the send quietly instead of staging the first result
    // as if nothing happened.
    if (isAbortError(repairError)) {
      throw repairError;
    }
    // A failed repair keeps the first result; the user still gets a plan.
    return {
      response: firstResponse,
      validatedOperations: firstValidated,
      rejected: firstPrepared.rejected,
      repaired: false,
    };
  }

  const secondPrepared = prepareAiOperations(secondResponse.operations);
  const secondValidated = validatePreparedAiOperations(
    secondPrepared.operations,
    {
      dawState,
      availableSamples,
    },
  );

  if (firstEmpty) {
    // The retry wins only if it staged something; otherwise the
    // first (text-only) answer stands.
    if (secondValidated.length > 0) {
      return {
        response: secondResponse,
        validatedOperations: secondValidated,
        rejected: secondPrepared.rejected,
        repaired: true,
      };
    }
    return {
      response: firstResponse,
      validatedOperations: firstValidated,
      rejected: firstPrepared.rejected,
      repaired: false,
    };
  }

  if (secondPrepared.rejected.length < firstPrepared.rejected.length) {
    return {
      response: secondResponse,
      validatedOperations: secondValidated,
      rejected: secondPrepared.rejected,
      repaired: true,
    };
  }

  return {
    response: firstResponse,
    validatedOperations: firstValidated,
    rejected: firstPrepared.rejected,
    repaired: false,
  };
}
