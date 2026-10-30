import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { publicProfileShareUrl } from "./public-profile-share";

export function SharePublicProfileAction({ profileId }: { profileId: string }) {
  const [failedForProfileId, setFailedForProfileId] = useState<string | null>(
    null,
  );
  const url = publicProfileShareUrl(profileId);
  if (!url) return null;

  const share = async () => {
    setFailedForProfileId(null);
    try {
      await Share.share({ message: url });
    } catch {
      setFailedForProfileId(profileId);
    }
  };

  const failed = failedForProfileId === profileId;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Compartir perfil público"
        onPress={() => void share()}
        style={styles.button}
      >
        <Text style={styles.label}>Compartir perfil</Text>
      </Pressable>
      {failed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          No pudimos abrir las opciones para compartir.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  label: {
    color: "#43366a",
    fontSize: 15,
    fontWeight: "700",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
});
