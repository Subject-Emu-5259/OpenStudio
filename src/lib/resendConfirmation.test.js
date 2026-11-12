import { describe, it, expect, vi } from "vitest";
import { resendConfirmationEmail } from "./resendConfirmation";
import { SUPABASE_UNCONFIGURED_MESSAGE } from "./supabase";

function makeClient(resendImpl) {
  return {
    auth: {
      resend: vi.fn(resendImpl),
    },
  };
}

describe("resendConfirmationEmail", () => {
  it("resends a signup confirmation to the trimmed address", async () => {
    const client = makeClient(async function () {
      return { error: null };
    });

    await resendConfirmationEmail(client, "  test@example.com  ");

    expect(client.auth.resend).toHaveBeenCalledOnce();
    expect(client.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "test@example.com",
    });
  });

  it("throws when the address is missing", async () => {
    const client = makeClient(async function () {
      return { error: null };
    });

    await expect(resendConfirmationEmail(client, "   ")).rejects.toThrow(
      "Enter the email address you signed up with.",
    );
    expect(client.auth.resend).not.toHaveBeenCalled();
  });

  it("passes Supabase errors through (including rate limits)", async () => {
    const client = makeClient(async function () {
      return { error: { message: "Email rate limit exceeded" } };
    });

    await expect(
      resendConfirmationEmail(client, "test@example.com"),
    ).rejects.toThrow("Email rate limit exceeded");
  });

  it("throws the unconfigured message when the client cannot resend", async () => {
    await expect(
      resendConfirmationEmail({ auth: {} }, "test@example.com"),
    ).rejects.toThrow(SUPABASE_UNCONFIGURED_MESSAGE);
  });
});
