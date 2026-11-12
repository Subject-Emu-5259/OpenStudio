import { useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setUser, setAuthLoading, setAuthError } from "../../store/userSlice";
import {
  SUPABASE_UNCONFIGURED_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from "../../lib/supabase";
import {
  buildMissingProfileRow,
  resolveLoginEmail,
  resolveSessionUser,
  signupHasSession,
} from "../../lib/sessionUser";
import { resendConfirmationEmail } from "../../lib/resendConfirmation";

export function AuthDialog({ onClose }) {
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector(function (state) {
    return state.user;
  });
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [confirmationNotice, setConfirmationNotice] = useState(null);
  const [loginNeedsConfirmation, setLoginNeedsConfirmation] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState(null); // null | "sending" | "sent"

  const resetForm = useCallback(function () {
    setUsername("");
    setNickname("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setValidationError(null);
    setConfirmationNotice(null);
    setLoginNeedsConfirmation(false);
    setResendEmail("");
    setResendStatus(null);
    dispatch(setAuthError(null));
  }, [dispatch]);

  const toggleMode = useCallback(function () {
    setMode(function (prev) {
      return prev === "login" ? "register" : "login";
    });
    resetForm();
  }, [resetForm]);

  const validate = useCallback(function () {
    if (!username.trim() || !password.trim()) {
      return "Username and password are required.";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }
    if (mode === "register") {
      if (!nickname.trim()) {
        return "Nickname is required.";
      }
      if (!email.trim()) {
        return "Email is required.";
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return "Please enter a valid email address.";
      }
      if (password !== confirmPassword) {
        return "Passwords do not match.";
      }
    }
    return null;
  }, [username, nickname, email, password, confirmPassword, mode]);

  const handleLogin = useCallback(
    async function () {
      if (!isSupabaseConfigured) {
        dispatch(setAuthError(SUPABASE_UNCONFIGURED_MESSAGE));
        return;
      }

      dispatch(setAuthLoading(true));
      try {
        // The username lookup is a convenience, not a gate: when no row
        // matches, the input itself is tried as the email, so a valid
        // auth account without a profile row can still sign in.
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("username", username.trim())
          .single();

        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: resolveLoginEmail(username, profile),
            password,
          });

        if (authError) {
          // An unconfirmed account fails sign-in with this message. Offer
          // the resend right here instead of a dead end: login mode has no
          // email field, so prefill the resend address from the lookup.
          if (/email not confirmed/i.test(authError.message || "")) {
            setConfirmationNotice(
              "Your email isn't confirmed yet. Resend the confirmation email below, then check your inbox (and spam).",
            );
            setLoginNeedsConfirmation(true);
            setResendEmail(resolveLoginEmail(username, profile));
          }
          dispatch(setAuthError(authError.message));
          dispatch(setAuthLoading(false));
          return;
        }

        if (!authData.user) {
          dispatch(setAuthError("Invalid username or password."));
          dispatch(setAuthLoading(false));
          return;
        }

        const { data: userProfile } = await supabase
          .from("profiles")
          .select("username,nickname,email")
          .eq("id", authData.user.id)
          .single();

        // Profile data when present, session fallback otherwise — never a
        // null dereference on a missing row.
        const sessionShape = { user: authData.user };
        dispatch(setUser(resolveSessionUser(sessionShape, userProfile)));

        // Best-effort: give a rowless user a profile row for next time.
        const missingRow = buildMissingProfileRow(sessionShape, userProfile);
        if (missingRow) {
          try {
            await supabase.from("profiles").upsert(missingRow);
          } catch {
            // Non-fatal: the user is already signed in.
          }
        }

        dispatch(setAuthLoading(false));
        onClose();
      } catch (err) {
        dispatch(setAuthError(err.message || "Login failed."));
        dispatch(setAuthLoading(false));
      }
    },
    [dispatch, username, password, onClose],
  );

  const handleRegister = useCallback(
    async function () {
      if (!isSupabaseConfigured) {
        dispatch(setAuthError(SUPABASE_UNCONFIGURED_MESSAGE));
        return;
      }

      dispatch(setAuthLoading(true));
      try {
        const { data: existing } = await supabase
          .from("profiles")
          .select("username")
          .eq("username", username.trim())
          .single();

        if (existing) {
          dispatch(setAuthError("Username already taken."));
          dispatch(setAuthLoading(false));
          return;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (authError) {
          dispatch(setAuthError(authError.message));
          dispatch(setAuthLoading(false));
          return;
        }

        // Email confirmation is ON: a signup that returns no session is
        // NOT a login. The account exists but is unconfirmed — say so
        // instead of faking a logged-in state that evaporates on refresh.
        // The profile row is created on first real sign-in instead.
        if (!signupHasSession(authData)) {
          setConfirmationNotice(
            "Account created. Check your email to confirm, then sign in.",
          );
          dispatch(setAuthLoading(false));
          return;
        }

        if (!authData.user) {
          dispatch(setAuthError("Registration failed."));
          dispatch(setAuthLoading(false));
          return;
        }

        const { error: insertError } = await supabase.from("profiles").insert({
          id: authData.user.id,
          username: username.trim(),
          nickname: nickname.trim(),
          email: email.trim(),
        });

        if (insertError) {
          dispatch(setAuthError(insertError.message));
          dispatch(setAuthLoading(false));
          return;
        }

        dispatch(
          setUser({
            id: authData.user.id,
            username: username.trim(),
            nickname: nickname.trim(),
            email: email.trim(),
          }),
        );
        dispatch(setAuthLoading(false));
        onClose();
      } catch (err) {
        dispatch(setAuthError(err.message || "Registration failed."));
        dispatch(setAuthLoading(false));
      }
    },
    [dispatch, username, nickname, email, password, onClose],
  );

  const handleResend = useCallback(
    async function () {
      if (!isSupabaseConfigured) {
        dispatch(setAuthError(SUPABASE_UNCONFIGURED_MESSAGE));
        return;
      }

      // Register mode still has the signup email in the form; login mode
      // uses the resend field rendered with the confirmation block.
      const target = mode === "register" ? email.trim() : resendEmail.trim();
      if (!target) {
        setValidationError("Enter the email address you signed up with.");
        return;
      }

      setResendStatus("sending");
      try {
        await resendConfirmationEmail(supabase, target);
        setResendStatus("sent");
        setConfirmationNotice(
          "Confirmation email resent — check your inbox (and spam).",
        );
      } catch (err) {
        setResendStatus(null);
        setValidationError(
          err.message || "Could not resend the confirmation email.",
        );
      }
    },
    [dispatch, email, mode, resendEmail],
  );

  const handleSubmit = useCallback(
    function (event) {
      event.preventDefault();
      const validation = validate();
      if (validation) {
        setValidationError(validation);
        return;
      }
      setValidationError(null);

      if (mode === "login") {
        handleLogin();
      } else {
        handleRegister();
      }
    },
    [mode, validate, handleLogin, handleRegister],
  );

  const displayError = validationError || error;

  return (
    <div className="auth-dialog-overlay">
      <div className="auth-dialog">
        <header className="auth-dialog-header">
          <h3>{mode === "login" ? "Sign In" : "Create Account"}</h3>
          <button
            type="button"
            className="auth-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form className="auth-dialog-form" onSubmit={handleSubmit}>
          {displayError ? (
            <div className="auth-dialog-error">{displayError}</div>
          ) : null}

          {confirmationNotice ? (
            <div className="auth-dialog-notice">{confirmationNotice}</div>
          ) : null}

          {confirmationNotice || loginNeedsConfirmation ? (
            <div className="auth-dialog-resend">
              {mode === "login" ? (
                <label className="auth-dialog-field">
                  <span>Email</span>
                  <input
                    type="text"
                    value={resendEmail}
                    onChange={function (event) {
                      setResendEmail(event.target.value);
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="auth-dialog-link"
                onClick={handleResend}
                disabled={resendStatus === "sending"}
              >
                {resendStatus === "sending"
                  ? "Sending..."
                  : resendStatus === "sent"
                    ? "Resend again"
                    : "Resend confirmation email"}
              </button>
              {resendStatus === "sent" ? (
                <span className="auth-dialog-resend-sent">
                  Sent — check your inbox.
                </span>
              ) : null}
            </div>
          ) : null}

          <label className="auth-dialog-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={function (event) {
                setUsername(event.target.value);
              }}
              placeholder="your_username"
              autoComplete="username"
            />
          </label>

          {mode === "register" ? (
            <label className="auth-dialog-field">
              <span>Nickname</span>
              <input
                type="text"
                value={nickname}
                onChange={function (event) {
                  setNickname(event.target.value);
                }}
                placeholder="Your display name"
                autoComplete="nickname"
              />
            </label>
          ) : null}

          {mode === "register" ? (
            <label className="auth-dialog-field">
              <span>Email</span>
              <input
                type="text"
                value={email}
                onChange={function (event) {
                  setEmail(event.target.value);
                }}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
          ) : null}

          <label className="auth-dialog-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={function (event) {
                setPassword(event.target.value);
              }}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {mode === "login" ? (
            <label className="auth-dialog-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={function (event) {
                  setRememberMe(event.target.checked);
                }}
              />
              <span>Remember password</span>
            </label>
          ) : null}

          {mode === "register" ? (
            <label className="auth-dialog-field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={function (event) {
                  setConfirmPassword(event.target.value);
                }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
          ) : null}

          <button
            type="submit"
            className="auth-dialog-submit"
            disabled={isLoading}
          >
            {isLoading
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <footer className="auth-dialog-footer">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button type="button" className="auth-dialog-link" onClick={toggleMode}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="auth-dialog-link" onClick={toggleMode}>
                Sign in
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
