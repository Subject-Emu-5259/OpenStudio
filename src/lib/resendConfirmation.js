import { SUPABASE_UNCONFIGURED_MESSAGE } from "./supabase";

/**
 * Resend a Supabase signup confirmation email.
 * Throws an Error with a user-facing message when the address is missing,
 * the client cannot resend, or Supabase rejects the request (including its
 * resend rate limits, which surface here as the Supabase error message).
 */
export async function resendConfirmationEmail(client, email) {
  const target = String(email || "").trim();

  if (!target) {
    throw new Error("Enter the email address you signed up with.");
  }

  if (!client || !client.auth || typeof client.auth.resend !== "function") {
    throw new Error(SUPABASE_UNCONFIGURED_MESSAGE);
  }

  const { error } = await client.auth.resend({
    type: "signup",
    email: target,
  });

  if (error) {
    throw new Error(error.message || "Could not resend the confirmation email.");
  }
}
