/**
 * @fileoverview sessionUser — resolves the app's logged-in user from a
 * Supabase session plus an optional profiles row.
 *
 * The session is the source of truth for "logged in". A profiles row only
 * enriches the display fields; a signed-in user without a row is still
 * logged in (their account may predate profiles, or signup may have
 * skipped the insert). Every resolver here tolerates a missing row
 * instead of crashing or dropping the session, and no resolver ever
 * returns secrets — only display fields.
 */

/**
 * The part of an email before "@", used as a display-name fallback when
 * no profiles row exists. Returns "" for anything without an "@".
 *
 * @param {unknown} email
 * @returns {string}
 */
export function emailPrefix(email) {
  const raw = String(email || "").trim();
  const at = raw.indexOf("@");
  if (at <= 0) {
    return "";
  }
  return raw.slice(0, at);
}

/**
 * Builds the Redux user object from a session and an optional profile
 * row. Profile fields win when present; otherwise the session user's id
 * and email are used, with the username falling back to the email prefix
 * (or blank) and the nickname falling back to the username.
 *
 * @param {object} session — a Supabase session (or { user } shape)
 * @param {object|null} profile — a profiles row, or null when missing
 * @returns {{id: string, username: string, nickname: string, email: string}}
 */
export function resolveSessionUser(session, profile) {
  const user = (session && session.user) || {};
  const email = String((profile && profile.email) || user.email || "").trim();
  const username = String(
    (profile && profile.username) || emailPrefix(email) || "",
  ).trim();
  return {
    id: user.id || "",
    username,
    nickname: String((profile && profile.nickname) || username || "").trim(),
    email,
  };
}

/**
 * Builds the profiles row to upsert for a signed-in user who has no row
 * yet, or null when no row is needed (profile exists) or no valid row
 * can be built (missing id, email, or derivable username — all three
 * columns are NOT NULL, so a partial row must never be attempted).
 *
 * @param {object} session — a Supabase session (or { user } shape)
 * @param {object|null} profile — a profiles row, or null when missing
 * @returns {object|null}
 */
export function buildMissingProfileRow(session, profile) {
  if (profile) {
    return null;
  }

  const resolved = resolveSessionUser(session, null);
  if (!resolved.id || !resolved.email || !resolved.username) {
    return null;
  }

  return {
    id: resolved.id,
    username: resolved.username,
    nickname: resolved.nickname || resolved.username,
    email: resolved.email,
  };
}

/**
 * Resolves the email to sign in with. The username lookup is a
 * convenience, not a gate: when no profile row matches, the input itself
 * is tried as the email instead of failing the login outright.
 *
 * @param {unknown} input — what the user typed in the username field
 * @param {object|null} profile — the matched profiles row, or null
 * @returns {string}
 */
export function resolveLoginEmail(input, profile) {
  const fromProfile = String((profile && profile.email) || "").trim();
  if (fromProfile) {
    return fromProfile;
  }
  return String(input || "").trim();
}

/**
 * Whether a signUp result counts as logged in. Email confirmation is ON
 * for this project, so a signup that returns a user but no session is
 * NOT a login — the account is pending confirmation and the app must
 * say so instead of showing a logged-in state that evaporates on the
 * next refresh.
 *
 * @param {object} authData — the data object from supabase.auth.signUp
 * @returns {boolean}
 */
export function signupHasSession(authData) {
  return Boolean(authData && authData.session);
}
