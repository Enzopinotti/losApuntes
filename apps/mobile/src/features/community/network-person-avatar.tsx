import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { networkPersonAvatarUrl } from "./network-person-avatar-policy";

export function NetworkPersonAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null | undefined;
  displayName: string;
}) {
  const safeAvatarUrl = networkPersonAvatarUrl(avatarUrl);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initial =
    displayName.trim().slice(0, 1).toLocaleUpperCase("es-AR") || "?";

  return (
    <View accessible={false} style={styles.avatar}>
      <Text accessible={false} style={styles.initial}>
        {initial}
      </Text>
      {safeAvatarUrl && safeAvatarUrl !== failedUri ? (
        <Image
          accessible={false}
          source={{ uri: safeAvatarUrl }}
          resizeMode="cover"
          style={styles.image}
          onError={() => setFailedUri(safeAvatarUrl)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d8d8e6",
    borderRadius: 22,
    backgroundColor: "#efedf8",
  },
  initial: {
    color: "#43366a",
    fontSize: 17,
    fontWeight: "700",
  },
  image: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
});
