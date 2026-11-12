import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { AuthDialog } from "./AuthDialog";
import { userReducer } from "../../store/userSlice";
import { supabase } from "../../lib/supabase";

vi.mock("../../lib/supabase", () => ({
  isSupabaseConfigured: true,
  SUPABASE_UNCONFIGURED_MESSAGE:
    "Cloud login is unavailable because Supabase is not configured.",
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resend: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

function renderWithStore(ui) {
  const store = configureStore({
    reducer: { user: userReducer },
    preloadedState: { user: { currentUser: null, isLoading: false, error: null } },
  });
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

function singleResult(data) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  };
}

describe("AuthDialog resend", () => {
  beforeEach(function () {
    vi.clearAllMocks();
  });

  // 15s timeout: userEvent types char-by-char, and under full-suite load
  // the default 5s timeout flakes (passes alone in ~1s).
  it("shows a resend button after register without a session and resends", async () => {
    supabase.from.mockImplementation(() => singleResult(null));
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: null },
      error: null,
    });
    supabase.auth.resend.mockResolvedValue({ error: null });

    renderWithStore(<AuthDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Create one/i }));
    await userEvent.type(screen.getByPlaceholderText("your_username"), "newuser");
    await userEvent.type(screen.getByPlaceholderText("Your display name"), "New User");
    await userEvent.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
    const passwords = screen.getAllByPlaceholderText("••••••••");
    await userEvent.type(passwords[0], "password123");
    await userEvent.type(passwords[1], "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create Account/i }));

    expect(
      screen.getByText(/Check your email to confirm/i),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Resend confirmation email/i }),
    );

    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
    });
    // Exact text: the notice also mentions the inbox, so match the span only.
    expect(screen.getByText("Sent — check your inbox.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resend again/i }),
    ).toBeInTheDocument();
  }, 15000);

  it("offers a resend with a prefilled email when login fails unconfirmed", async () => {
    supabase.from.mockImplementation(() =>
      singleResult({ email: "test@example.com" }),
    );
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed" },
    });
    supabase.auth.resend.mockResolvedValue({ error: null });

    renderWithStore(<AuthDialog onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("your_username"), "testuser");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    expect(screen.getByText(/isn't confirmed yet/i)).toBeInTheDocument();
    const resendInput = screen.getByPlaceholderText("you@example.com");
    expect(resendInput).toHaveValue("test@example.com");

    await userEvent.click(
      screen.getByRole("button", { name: /Resend confirmation email/i }),
    );

    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "test@example.com",
    });
  }, 15000);
});
