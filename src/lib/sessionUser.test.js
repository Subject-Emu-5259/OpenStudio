import { describe, expect, it } from "vitest";
import {
  buildMissingProfileRow,
  emailPrefix,
  resolveLoginEmail,
  resolveSessionUser,
  signupHasSession,
} from "./sessionUser";

function createSession(overrides = {}) {
  return {
    user: Object.assign(
      { id: "user-1", email: "dre@example.com" },
      overrides,
    ),
  };
}

describe("emailPrefix", function () {
  it("returns the part before @", function () {
    expect(emailPrefix("dre@example.com")).toBe("dre");
    expect(emailPrefix("  dre@example.com  ")).toBe("dre");
  });

  it("returns blank for anything without a usable prefix", function () {
    expect(emailPrefix("")).toBe("");
    expect(emailPrefix(null)).toBe("");
    expect(emailPrefix("@example.com")).toBe("");
    expect(emailPrefix("not-an-email")).toBe("");
  });
});

describe("resolveSessionUser", function () {
  it("prefers the profile row when one exists", function () {
    const resolved = resolveSessionUser(createSession(), {
      username: "dre",
      nickname: "Dre",
      email: "other@example.com",
    });
    expect(resolved).toEqual({
      id: "user-1",
      username: "dre",
      nickname: "Dre",
      email: "other@example.com",
    });
  });

  it("falls back to the session when no profile row exists", function () {
    const resolved = resolveSessionUser(createSession(), null);
    expect(resolved).toEqual({
      id: "user-1",
      username: "dre",
      nickname: "dre",
      email: "dre@example.com",
    });
  });

  it("falls back to blank display fields when the session has no email", function () {
    const resolved = resolveSessionUser(createSession({ email: null }), null);
    expect(resolved).toEqual({
      id: "user-1",
      username: "",
      nickname: "",
      email: "",
    });
  });
});

describe("buildMissingProfileRow", function () {
  it("returns null when a profile row already exists", function () {
    expect(
      buildMissingProfileRow(createSession(), { username: "dre" }),
    ).toBeNull();
  });

  it("builds a complete row from the session when missing", function () {
    expect(buildMissingProfileRow(createSession(), null)).toEqual({
      id: "user-1",
      username: "dre",
      nickname: "dre",
      email: "dre@example.com",
    });
  });

  it("returns null when no valid row can be built", function () {
    expect(
      buildMissingProfileRow(createSession({ email: null }), null),
    ).toBeNull();
    expect(buildMissingProfileRow({ user: { email: "a@b.co" } }, null)).toBeNull();
  });
});

describe("resolveLoginEmail", function () {
  it("uses the profile email when a row matches", function () {
    expect(resolveLoginEmail("dre", { email: "dre@example.com" })).toBe(
      "dre@example.com",
    );
  });

  it("falls back to the input itself when no row matches", function () {
    expect(resolveLoginEmail("dre@example.com", null)).toBe("dre@example.com");
    expect(resolveLoginEmail("  dre@example.com  ", null)).toBe("dre@example.com");
  });
});

describe("signupHasSession", function () {
  it("is true only when a session actually exists", function () {
    expect(signupHasSession({ session: { access_token: "x" } })).toBe(true);
    expect(signupHasSession({ user: { id: "user-1" }, session: null })).toBe(false);
    expect(signupHasSession({ user: { id: "user-1" } })).toBe(false);
    expect(signupHasSession(null)).toBe(false);
  });
});
