import type { CSSProperties, ReactNode } from "react";
import { Component } from "react";

type WebErrorBoundaryProps = {
  children: ReactNode;
  onError(error: unknown): void;
};

type WebErrorBoundaryState = {
  failed: boolean;
};

export class WebErrorBoundary extends Component<
  WebErrorBoundaryProps,
  WebErrorBoundaryState
> {
  override state: WebErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WebErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    try {
      this.props.onError(error);
    } catch {
      // Diagnostics must never make the recovery surface unusable.
    }
  }

  private readonly retry = (): void => {
    this.setState({ failed: false });
  };

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main style={styles.container}>
        <section aria-labelledby="web-recovery-title" style={styles.card}>
          <h1 id="web-recovery-title" style={styles.title}>
            Los Apuntes encontró un problema
          </h1>
          <p style={styles.copy}>
            No incluimos datos privados en el diagnóstico. Podés intentar cargar
            nuevamente esta pantalla.
          </p>
          <button type="button" onClick={this.retry} style={styles.button}>
            Intentar de nuevo
          </button>
        </section>
      </main>
    );
  }
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "#f7f7fb",
  },
  card: {
    width: "min(100%, 560px)",
    display: "grid",
    gap: "16px",
    padding: "24px",
    borderRadius: "16px",
    background: "#ffffff",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.08)",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.5rem, 4vw, 2rem)",
    lineHeight: 1.2,
    color: "#17171c",
  },
  copy: {
    margin: 0,
    fontSize: "1rem",
    lineHeight: 1.5,
    color: "#55555f",
  },
  button: {
    justifySelf: "start",
    border: 0,
    borderRadius: "10px",
    padding: "12px 16px",
    font: "inherit",
    fontWeight: 700,
    color: "#ffffff",
    background: "#17171c",
    cursor: "pointer",
  },
};
