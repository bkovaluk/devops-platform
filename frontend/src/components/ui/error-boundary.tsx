import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './error-state'

interface Props {
  /** What broke, in the reader's words: "Flags view". */
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/** A render failure stays inside the surface that failed; the shell around it keeps working. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} failed to render`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <ErrorState
        className="flex-1"
        heading={`${this.props.label} stopped working`}
        detail={this.state.error.message}
        onRetry={() => this.setState({ error: null })}
      />
    )
  }
}
