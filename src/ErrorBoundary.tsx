import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Błąd KKF Studio:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40,
          color: "#ffffff",
          background: "#101116",
          minHeight: "100vh",
          fontFamily: "Arial"
        }}>
          <h2>Wystąpił błąd w KKF Studio</h2>
          <p>Nie udało się wyświetlić danych faktury.</p>
          <pre style={{ whiteSpace: "pre-wrap", color: "#ff9999" }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
          <button onClick={() => window.location.reload()}>
            Uruchom ponownie
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}