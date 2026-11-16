import { Component } from "react"

function getErrorMessage(error) {
  return String(error?.message || error || "Unknown application error")
}

/**
 * Last-resort UI protection for unexpected React render failures.
 * It prevents a blank screen and gives the user a safe reload path.
 *
 * Deliberately React-only: this boundary does NOT listen to window
 * "error" or "unhandledrejection" events. Async failures — a sample
 * fetch 404ing, a decode failing, a rejected promise somewhere in the
 * audio engine — are not a broken UI, and blanking the whole workspace
 * for one of them is worse than the failure itself. Those failures are
 * handled where they occur (loaders resolve to null, callers check).
 * An earlier version listened globally and turned every failed sample
 * load after an AI plan apply into a full-app crash screen.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error("OpenStudio recovered from a React error", error, errorInfo)
  }

  handleReloadClick = () => {
    // Bust the cache on purpose: Wasmer pins Cache-Control: max-age=86400
    // on the HTML shell, so a plain reload re-serves the cached build —
    // including the build that just crashed. A unique query string makes
    // the browser fetch the shell fresh, which pulls the newest bundle.
    const base = window.location.href.split("?")[0].split("#")[0]
    window.location.href = base + "?fresh=" + Date.now()
  }

  handleToggleDetails = () => {
    this.setState(function (state) {
      return { showDetails: !state.showDetails }
    })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const message = getErrorMessage(this.state.error)
    const componentStack = String(this.state.errorInfo?.componentStack || "").trim()

    return (
      <main className="app-error-boundary" role="alert">
        <section className="app-error-boundary-card">
          <p className="app-error-boundary-kicker">OpenStudio</p>
          <h1>Something went wrong</h1>
          <p className="app-error-boundary-message">
            The app caught an unexpected error and stopped the broken UI before it could crash the whole workspace.
          </p>

          <div className="app-error-boundary-actions">
            <button type="button" onClick={this.handleReloadClick}>
              Reload app
            </button>
            <button type="button" onClick={this.handleToggleDetails}>
              {this.state.showDetails ? "Hide details" : "Show details"}
            </button>
          </div>

          {this.state.showDetails ? (
            <pre className="app-error-boundary-details">
              {message}
              {componentStack ? "\n" + componentStack : ""}
            </pre>
          ) : null}
        </section>
      </main>
    )
  }
}
