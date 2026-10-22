import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileSearchResumeMemory } from "@/features/search/search-resume-memory";

export function HomeSearchResumeCard({
  sessionAuthorityKey,
}: {
  sessionAuthorityKey: string | null;
}) {
  const router = useRouter();
  const [hasSearch, setHasSearch] = useState(() =>
    mobileSearchResumeMemory.has(sessionAuthorityKey),
  );

  useEffect(() => {
    const refresh = () =>
      setHasSearch(mobileSearchResumeMemory.has(sessionAuthorityKey));
    const unsubscribe = mobileSearchResumeMemory.subscribe(refresh);
    mobileSearchResumeMemory.setSession(sessionAuthorityKey);
    refresh();
    return unsubscribe;
  }, [sessionAuthorityKey]);

  if (!sessionAuthorityKey || !hasSearch) return null;

  return (
    <View style={styles.card}>
      <View style={styles.copyBlock}>
        <Text accessibilityRole="header" style={styles.heading}>
          Seguí tu búsqueda
        </Text>
        <Text style={styles.copy}>
          Retomá la consulta de esta sesión. Los resultados se vuelven a
          comprobar al abrirla.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continuar búsqueda"
          accessibilityHint="Vuelve a Buscar y consulta resultados actuales con los permisos de esta sesión."
          onPress={() =>
            router.push({
              pathname: "/(tabs)/search",
              params: { resumeRecentSearch: "1" },
            })
          }
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Continuar búsqueda</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda reciente"
          accessibilityHint="Quita la consulta de esta sesión. No borra apuntes guardados."
          onPress={() => mobileSearchResumeMemory.clear(sessionAuthorityKey)}
          style={styles.clearButton}
        >
          <Text style={styles.clearLabel}>Borrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e4e1eb",
  },
  copyBlock: { gap: 6 },
  heading: { fontSize: 17, fontWeight: "700", color: "#20202a" },
  copy: { fontSize: 14, lineHeight: 20, color: "#5b5b66" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f1eff8",
  },
  buttonLabel: { fontSize: 14, fontWeight: "700", color: "#43376a" },
  clearButton: {
    minWidth: 84,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d7d2e1",
    paddingHorizontal: 12,
  },
  clearLabel: { fontSize: 14, fontWeight: "700", color: "#43376a" },
});
