import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { buildMobileResourceSharePayload } from "./resource-share-link";

export function MobileResourceShareAction({
  resourceId,
  resourceTitle,
}: {
  resourceId: string;
  resourceTitle: string;
}) {
  const [shareFailed, setShareFailed] = useState(false);
  const payload = buildMobileResourceSharePayload({
    id: resourceId,
    title: resourceTitle,
  });

  if (!payload) return null;

  const shareResource = async () => {
    setShareFailed(false);
    try {
      await Share.share({ message: payload.message });
    } catch {
      setShareFailed(true);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Compartir enlace de ${payload.title}`}
        accessibilityHint="El enlace no concede acceso; quien lo abra debe tener permiso vigente."
        onPress={() => void shareResource()}
        style={styles.button}
      >
        <Text style={styles.label}>Compartir enlace</Text>
      </Pressable>
      {shareFailed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          No pudimos abrir las opciones para compartir. Volvé a intentarlo.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4, alignItems: "flex-start" },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  label: { fontSize: 14, fontWeight: "700", color: "#43376a" },
  error: {
    maxWidth: 280,
    flexShrink: 1,
    color: "#9f1d1d",
    fontSize: 13,
    lineHeight: 19,
  },
});
