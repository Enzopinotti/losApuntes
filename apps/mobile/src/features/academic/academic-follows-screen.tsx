import { useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ApiFailureKind } from "@/services/api/client";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import { AcademicFollowsController } from "./academic-follows-controller";
import type { AcademicFollow } from "./academic-follows-api";
import { mobileAcademicFollowsApi } from "./academic-follows-runtime";

const followFailureCopy: Record<ApiFailureKind, string> = {
  unauthorized: "Tu sesión venció. Iniciá sesión y volvé a intentarlo.",
  forbidden: "La cuenta no puede cambiar sus seguimientos ahora.",
  validation: "El catálogo cambió. Volvé a buscar la institución o carrera.",
  conflict: "El seguimiento cambió en otro dispositivo. Actualizá la lista.",
  gone: "La institución o carrera ya no está disponible en el catálogo.",
  offline: "Sin conexión. Revisá tus seguimientos cuando vuelva internet.",
  timeout: "La operación tardó demasiado. Actualizá tus seguimientos.",
  server_unavailable: "El servicio académico no está disponible ahora.",
  unexpected: "No pudimos completar la operación académica.",
};

const kindLabels: Record<AcademicFollow["kind"], string> = {
  institution: "Institución",
  program: "Carrera",
};

export function AcademicFollowsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session, retryRestore } = useSession();
  const [appState, setAppState] = useState(AppState.currentState);
  const [kind, setKind] = useState<AcademicFollow["kind"]>("institution");
  const [query, setQuery] = useState("");
  const controller = useMemo(
    () => new AcademicFollowsController(mobileAcademicFollowsApi),
    [],
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = activeNavigationAuthorityKey(
    sessionAuthority,
    isFocused,
    appState,
  );
  const current = snapshot.authorityKey === authorityKey ? snapshot : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    controller.setAuthority(authorityKey);
    if (!authorityKey) return;
    void controller.load(authorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setKind("institution");
    setQuery("");
  }, [authorityKey]);

  const retry = useCallback(() => {
    if (authorityKey) void controller.load(authorityKey);
  }, [authorityKey, controller]);

  const search = useCallback(() => {
    if (authorityKey && query.trim().length >= 2) {
      void controller.search(authorityKey, kind, query);
    }
  }, [authorityKey, controller, kind, query]);

  const chooseKind = (nextKind: AcademicFollow["kind"]) => {
    setKind(nextKind);
    if (authorityKey && query.trim().length >= 2) {
      void controller.search(authorityKey, nextKind, query);
    }
  };

  if (session.kind === "restoring") {
    return (
      <ProductSurface
        title="Instituciones y carreras"
        description="Seguí opciones académicas para encontrar preguntas y recursos relacionados."
      >
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Validando sesión" />
          <Text style={styles.copy}>Validando tu sesión…</Text>
        </View>
      </ProductSurface>
    );
  }

  if (
    session.kind === "offline" ||
    session.kind === "timeout" ||
    session.kind === "server_unavailable" ||
    session.kind === "error"
  ) {
    return (
      <ProductSurface
        title="Instituciones y carreras"
        description="Seguí opciones académicas para encontrar preguntas y recursos relacionados."
      >
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {session.kind === "offline"
              ? "No pudimos validar tu sesión porque no hay conexión."
              : session.kind === "timeout"
                ? "La validación de tu sesión tardó demasiado."
                : session.kind === "server_unavailable"
                  ? "El servicio de sesión no está disponible ahora."
                  : "No pudimos validar tu sesión."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void retryRestore()}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </View>
      </ProductSurface>
    );
  }

  if (session.kind === "restricted") {
    return (
      <ProductSurface
        title="Instituciones y carreras"
        description="Seguí opciones académicas para encontrar preguntas y recursos relacionados."
      >
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            La cuenta tiene restringido el acceso a esta función.
          </Text>
        </View>
      </ProductSurface>
    );
  }

  if (session.kind === "unauthenticated") {
    return (
      <ProductSurface
        title="Instituciones y carreras"
        description="Seguí opciones académicas para encontrar preguntas y recursos relacionados."
      >
        <View style={styles.card}>
          <Text style={styles.copy}>
            Iniciá sesión para administrar tus instituciones y carreras
            seguidas.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/sign-in")}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </ProductSurface>
    );
  }

  return (
    <ProductSurface
      title="Instituciones y carreras"
      description="Seguí instituciones y programas para organizar tu recorrido académico. Los seguimientos se guardan en tu cuenta."
      onRefresh={authorityKey ? retry : undefined}
      refreshing={current?.listRefreshing ?? false}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.link}>Volver</Text>
      </Pressable>

      {!authorityKey ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            La lista queda oculta al salir de esta pantalla o suspender la app.
            Volvé a abrirla para validar la sesión.
          </Text>
        </View>
      ) : !current || current.listPhase === "loading" ? (
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Cargando seguimientos" />
          <Text style={styles.copy}>Cargando tus seguimientos…</Text>
        </View>
      ) : (
        <>
          {current.listFailure ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                {followFailureCopy[current.listFailure]}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Actualizar seguimientos</Text>
              </Pressable>
            </View>
          ) : null}

          {current.truncated ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.warning}>
                Mostramos hasta {current.limit} seguimientos. La lista visible
                puede estar incompleta.
              </Text>
            </View>
          ) : null}

          {current.actionFailure ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                {followFailureCopy[current.actionFailure]}
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tus seguimientos</Text>
            {current.follows.length === 0 ? (
              <Text style={styles.copy}>
                Todavía no seguís instituciones ni carreras.
              </Text>
            ) : (
              current.follows.map((follow) => (
                <View key={follow.targetId} style={styles.followRow}>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle}>{follow.name}</Text>
                    <Text style={styles.itemMeta}>
                      {kindLabels[follow.kind]}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Dejar de seguir ${follow.name}`}
                    accessibilityState={{
                      disabled: current.pendingTargetIds.includes(
                        follow.targetId,
                      ),
                    }}
                    disabled={current.pendingTargetIds.includes(
                      follow.targetId,
                    )}
                    onPress={() =>
                      void controller.toggleFollow(authorityKey, {
                        id: follow.targetId,
                        kind: follow.kind,
                        name: follow.name,
                      })
                    }
                    style={styles.smallButton}
                  >
                    <Text style={styles.buttonText}>
                      {current.pendingTargetIds.includes(follow.targetId)
                        ? "Guardando…"
                        : "Dejar de seguir"}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Buscar en el catálogo</Text>
            <View style={styles.kindTabs}>
              {(["institution", "program"] as const).map((option) => {
                const selected = kind === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => chooseKind(option)}
                    style={[
                      styles.kindTab,
                      selected ? styles.kindTabSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.kindTabText,
                        selected ? styles.kindTabTextSelected : null,
                      ]}
                    >
                      {kindLabels[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              accessibilityLabel={`Buscar ${kindLabels[kind].toLowerCase()}`}
              autoCapitalize="none"
              onChangeText={setQuery}
              onSubmitEditing={search}
              placeholder={
                kind === "institution"
                  ? "Nombre de la institución"
                  : "Nombre de la carrera"
              }
              returnKeyType="search"
              value={query}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Escribí al menos 2 caracteres. Solo aparecen opciones activas del
              catálogo.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: query.trim().length < 2 }}
              disabled={query.trim().length < 2}
              onPress={search}
              style={[
                styles.primaryButton,
                query.trim().length < 2 ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>Buscar</Text>
            </Pressable>

            {current.searchPhase === "loading" ? (
              <View style={styles.inline}>
                <ActivityIndicator accessibilityLabel="Buscando en el catálogo" />
                <Text style={styles.copy}>Buscando opciones activas…</Text>
              </View>
            ) : null}
            {current.searchFailure ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {followFailureCopy[current.searchFailure]}
              </Text>
            ) : null}
            {current.searchPhase === "ready" && current.results.length === 0 ? (
              <Text style={styles.copy}>
                No encontramos opciones activas con ese nombre.
              </Text>
            ) : null}
            {current.results.map((item) => {
              const following = current.follows.some(
                (follow) => follow.targetId === item.id,
              );
              const pending = current.pendingTargetIds.includes(item.id);
              return (
                <View key={item.id} style={styles.followRow}>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {kindLabels[item.kind as AcademicFollow["kind"]]}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${following ? "Dejar de seguir" : "Seguir"} ${item.name}`}
                    accessibilityState={{
                      disabled: pending,
                      selected: following,
                    }}
                    disabled={pending}
                    onPress={() =>
                      void controller.toggleFollow(authorityKey, item)
                    }
                    style={styles.smallButton}
                  >
                    <Text style={styles.buttonText}>
                      {pending
                        ? "Guardando…"
                        : following
                          ? "Dejar de seguir"
                          : "Seguir"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            {current.nextCursor ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: current.loadingMore }}
                disabled={current.loadingMore}
                onPress={() => void controller.loadMore(authorityKey)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>
                  {current.loadingMore ? "Cargando…" : "Ver más opciones"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  link: { color: "#2d4f97", fontSize: 15, fontWeight: "700" },
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  sectionTitle: { color: "#20202a", fontSize: 17, fontWeight: "700" },
  copy: { color: "#5b5b66", fontSize: 15, lineHeight: 22 },
  hint: { color: "#646470", fontSize: 13, lineHeight: 18 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 20 },
  warning: { color: "#765b00", fontSize: 14, lineHeight: 20 },
  kindTabs: { flexDirection: "row", gap: 8 },
  kindTab: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d6d6df",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  kindTabSelected: { borderColor: "#24243a", backgroundColor: "#f2f2f7" },
  kindTabText: { color: "#4f4f5a", fontSize: 14, fontWeight: "600" },
  kindTabTextSelected: { color: "#20202a" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#20202a",
  },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  buttonDisabled: { opacity: 0.45 },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  smallButton: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 10,
    paddingHorizontal: 11,
  },
  buttonText: { color: "#24243a", fontSize: 13, fontWeight: "700" },
  followRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#ededf1",
    paddingTop: 12,
  },
  flex: { flex: 1, gap: 3 },
  itemTitle: { color: "#20202a", fontSize: 15, fontWeight: "700" },
  itemMeta: { color: "#666673", fontSize: 13 },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
});
