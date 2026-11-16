import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ErrorBoundary } from "./ErrorBoundary"

function BrokenComponent() {
  throw new Error("Broken component")
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(function () {})
    Object.defineProperty(window, "location", {
      value: { href: "https://openstudio.wasmer.app/" },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>DAW workspace</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText("DAW workspace")).toBeInTheDocument()
  })

  it("shows fallback UI when a child component crashes", async () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /show details/i }))
    expect(screen.getByText(/broken component/i)).toBeInTheDocument()
  })

  it("offers a reload action that busts the cached shell", async () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )

    await userEvent.click(screen.getByRole("button", { name: /reload app/i }))
    // A plain reload would re-serve the cached build that just crashed —
    // Reload must navigate to a fresh URL instead.
    expect(window.location.href).toMatch(/^https:\/\/openstudio\.wasmer\.app\/\?fresh=\d+$/)
  })

  it("does not trip on window errors or unhandled rejections", () => {
    // Regression: an earlier version listened globally, so a failed
    // sample load after an AI plan apply blanked the whole workspace.
    // Async failures are not a broken UI — the boundary stays React-only.
    render(
      <ErrorBoundary>
        <p>DAW workspace</p>
      </ErrorBoundary>,
    )

    window.dispatchEvent(new Event("error"))
    const rejectionEvent = new Event("unhandledrejection")
    window.dispatchEvent(rejectionEvent)

    expect(screen.getByText("DAW workspace")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
