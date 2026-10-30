import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  publicProfileAvatarInitial,
  publicProfileAvatarUri,
} from "./public-profile-avatar-policy";

export function PublicProfileAvatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null | undefined;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const uri = publicProfileAvatarUri(avatarUrl);

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.avatar}
    >
      <Text accessible={false} style={styles.initial}>
        {publicProfileAvatarInitial(displayName)}
      </Text>
      {uri && uri !== failedUri ? (
        <Image
          accessible={false}
          onError={() => setFailedUri(uri)}
          resizeMode="cover"
          source={{ uri }}
          style={styles.image}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#ece9f5",
  },
  initial: {
    color: "#43366a",
    fontSize: 22,
    fontWeight: "700",
  },
  image: {
    ...StyleSheet.absoluteFill,
    width: 56,
    height: 56,
  },
});
