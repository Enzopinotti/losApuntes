import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type MobileErrorBoundaryProps = {
  children: ReactNode;
  onError(error: unknown): void;
};

type MobileErrorBoundaryState = {
  failed: boolean;
};

export class MobileErrorBoundary extends Component<
  MobileErrorBoundaryProps,
  MobileErrorBoundaryState
> {
  state: MobileErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MobileErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    this.props.onError(error);
  }

  private readonly retry = (): void => {
    this.setState({ failed: false });
  };

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          La app encontró un problema
        </Text>
        <Text style={styles.copy}>
          Tus datos privados no se incluyen en el diagnóstico. Podés intentar
          volver a cargar esta pantalla.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.retry}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Intentar de nuevo</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: "#f7f7fb",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#17171c",
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: "#55555f",
  },
  button: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#17171c",
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});
