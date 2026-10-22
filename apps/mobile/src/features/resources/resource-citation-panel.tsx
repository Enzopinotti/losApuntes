import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import type { ResourceView } from "@losapuntes/contracts";

import { buildMobileResourceCitation } from "./resource-citation";

export function MobileResourceCitationPanel({
  resource,
}: {
  resource: ResourceView;
}) {
  const [expanded, setExpanded] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const citation = buildMobileResourceCitation(resource);

  if (!citation) return null;

  const shareCitation = async () => {
    setShareFailed(false);
    try {
      await Share.share({ message: citation });
    } catch {
      setShareFailed(true);
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Referencia académica
      </Text>
      <Text style={styles.copy}>
        Referencia orientativa, no equivale a una cita APA certificada ni
        verifica la autoría. Revisala antes de usarla.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "Ocultar referencia" : "Preparar referencia del apunte"
        }
        accessibilityState={{ expanded }}
        onPress={() => {
          setExpanded((current) => !current);
          setShareFailed(false);
        }}
        style={styles.secondaryButton}
      >
        <Text style={styles.buttonText}>
          {expanded ? "Ocultar referencia" : "Preparar referencia"}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.preview}>
          <Text style={styles.copy}>
            No incluye un enlace ni cambia quién tiene permiso para acceder al
            apunte.
          </Text>
          <Text selectable style={styles.citation}>
            {citation}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir referencia del apunte"
            onPress={() => void shareCitation()}
            style={styles.primaryButton}
          >
            <Text style={styles.buttonText}>Compartir referencia</Text>
          </Pressable>
          {shareFailed ? (
            <Text accessibilityRole="alert" style={styles.error}>
              No pudimos abrir las opciones para compartir. Podés seleccionar la
              referencia y copiarla manualmente.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#dce4eb",
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  heading: { color: "#132a3a", fontSize: 17, fontWeight: "700" },
  copy: { color: "#526675", fontSize: 14, lineHeight: 20 },
  preview: { gap: 12 },
  citation: {
    backgroundColor: "#f5f8fa",
    borderRadius: 8,
    color: "#132a3a",
    fontSize: 15,
    lineHeight: 22,
    padding: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#166b73",
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#edf4f7",
    borderColor: "#c7d7df",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonText: { color: "#173449", fontSize: 15, fontWeight: "700" },
  error: { color: "#a22b32", fontSize: 14, lineHeight: 20 },
});
