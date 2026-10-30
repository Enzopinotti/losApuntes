import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import {
  publicProfileActivityExternalUrl,
} from "./public-profile-activity-link-policy";

export function PublicProfileActivityLink({
  title,
  value,
}: {
  title: string;
  value: string | null | undefined;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openingRef = useRef(false);
  const mountedRef = useRef(true);
  const url = publicProfileActivityExternalUrl(value);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!url) return null;
  const externalHost = new URL(url).hostname;
  const accessibilityLabel = `Abrir enlace externo de ${title} en ${externalHost}`;

  const open = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError(null);
    try {
      await Linking.openURL(url);
    } catch {
      if (mountedRef.current) {
        setError("No pudimos abrir el enlace externo de esta actividad.");
      }
    } finally {
      openingRef.current = false;
      if (mountedRef.current) setOpening(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        onPress={() => void open()}
        style={styles.action}
      >
        <Text style={styles.label}>
          {opening ? "Abriendo enlace…" : "Abrir enlace externo"} ·
          {` ${externalHost}`}
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  action: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  label: {
    color: "#3446a2",
    fontWeight: "700",
    fontSize: 14,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 13,
  },
});
