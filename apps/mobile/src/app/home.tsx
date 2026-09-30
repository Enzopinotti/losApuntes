import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/features/session/session-provider";

export default function HomeRoute() {
  const { snapshot, logout } = useSession();
  const insets = useSafeAreaInsets();

  if (snapshot.kind !== "authenticated") {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: Math.max(insets.top, 24), paddingBottom: insets.bottom },
      ]}
    >
      <Text accessibilityRole="header" style={styles.title}>
        Tu universidad, en un solo lugar
      </Text>
      <Text style={styles.email}>{snapshot.user.email}</Text>
      <Text style={styles.copy}>
        La base nativa ya usa la misma sesión autoritativa que Web. El producto
        Mobile completo se construye sobre este boundary.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void logout()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 14,
    backgroundColor: "#f7f7fb",
  },
  title: {
    marginTop: 48,
    fontSize: 30,
    fontWeight: "800",
    color: "#17171c",
  },
  email: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3c3c47",
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: "#55555f",
  },
  button: {
    marginTop: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
});
