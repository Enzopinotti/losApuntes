import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AcademicCurrentContext,
  FeedItem,
  FeedPageResponse,
  PilotHomeResponse,
} from "@losapuntes/contracts";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { AcademicContextCard } from "@/features/academic/academic-context-card";
import { ProductSurface } from "@/features/navigation/product-surface";
import { mobileAuthenticatedApi } from "@/features/session/session-runtime";
import { useSession } from "@/features/session/session-provider";

import {
  academicContextBelongsToSession,
  academicContextSignature,
  MobileHomeController,
  type MobileHomeSnapshot,
} from "./home-controller";
import { useAcademicContext } from "../academic/academic-context-provider";

const itemKindLabel = (item: FeedItem): string => {
  if (item.type === "resource") return "Apunte";
  if (item.type === "question") return "Pregunta";
  return "Publicación de organización";
};

const sourceLabel = (item: FeedItem): string =>
  item.source.kind === "campus_organization"
    ? item.source.organization.name
    : item.author.displayName;

function FeedSection({
  title,
  feed,
}: {
  title: string;
  feed: FeedPageResponse;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {feed.items.length === 0 ? (
        <Text style={styles.copy}>
          Todavía no hay contenido útil para esta tanda.
        </Text>
      ) : (
        feed.items.map((item) => (
          <View key={`${item.type}:${item.id}`} style={styles.feedItem}>
            <Text style={styles.itemKind}>{itemKindLabel(item)}</Text>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.academic.subject ? (
              <Text style={styles.itemMeta}>
                {item.academic.subject.name} · {sourceLabel(item)}
              </Text>
            ) : (
              <Text style={styles.itemMeta}>{sourceLabel(item)}</Text>
            )}
            {item.summary ? (
              <Text numberOfLines={3} style={styles.copy}>
                {item.summary}
              </Text>
            ) : null}
          </View>
        ))
      )}
      {feed.nextCursor ? (
        <Text style={styles.moreCopy}>
          Esta es una tanda breve; hay más contenido disponible.
        </Text>
      ) : null}
      {feed.stopReason === "natural_break" ? (
        <Text style={styles.moreCopy}>
          El servidor terminó esta tanda en una pausa natural.
        </Text>
      ) : null}
    </View>
  );
}

function LoadingCard({ refreshing = false }: { refreshing?: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.inline}>
        <ActivityIndicator accessibilityLabel="Preparando inicio" />
        <Text style={styles.copy}>
          {refreshing
            ? "Actualizando tu inicio…"
            : "Preparando una tanda basada en tu contexto…"}
        </Text>
      </View>
    </View>
  );
}

function RetryCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.error}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Text style={styles.retryLabel}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

const failureCopy: Partial<Record<MobileHomeSnapshot["kind"], string>> = {
  offline: "No hay conexión. No pudimos actualizar tu inicio.",
  timeout: "La preparación de tu inicio tardó demasiado.",
  server_unavailable: "El servicio de inicio no está disponible ahora.",
  restricted: "La cuenta no puede acceder a este contenido.",
  error: "No pudimos preparar tu inicio.",
};

export function HomeScreen() {
  const router = useRouter();
  const { snapshot: session } = useSession();
  const { snapshot: academic, retry: retryAcademic } = useAcademicContext();
  const controller = useMemo(
    () => new MobileHomeController(mobileAuthenticatedApi),
    [],
  );
  const [home, setHome] = useState<MobileHomeSnapshot>(
    controller.getSnapshot(),
  );
  const [appState, setAppState] = useState(AppState.currentState);
  const [refreshPending, setRefreshPending] = useState(false);
  const reconciledAuthority = useRef<string | null>(null);

  useEffect(() => controller.subscribe(setHome), [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const academicData =
    academic.kind === "ready" || academic.kind === "no_context"
      ? academic.data
      : null;
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const academicBelongsToSession = academicContextBelongsToSession(
    sessionAuthority,
    academicData?.contextAuthorityKey ?? null,
  );
  const safeToRenderAcademic = !academicData || academicBelongsToSession;
  const homeAuthority =
    sessionAuthority && academicData && academicBelongsToSession
      ? `${sessionAuthority}:${academicData.contextAuthorityKey}`
      : null;
  const expectedContext: AcademicCurrentContext | null =
    academicData?.context ?? null;
  const contextSignature = academicContextSignature(expectedContext);
  const canLoad =
    Boolean(homeAuthority) &&
    Boolean(academicData) &&
    appState === "active" &&
    (academic.kind === "ready" || academic.kind === "no_context");

  useEffect(() => {
    if (!canLoad || !homeAuthority) {
      controller.invalidate();
      return;
    }

    void controller.load(homeAuthority, expectedContext);
    return () => controller.invalidate(homeAuthority);
  }, [
    academic.kind,
    canLoad,
    contextSignature,
    controller,
    expectedContext,
    homeAuthority,
  ]);

  const refresh = useCallback(() => {
    if (!canLoad || !homeAuthority) return;
    setRefreshPending(true);
    void retryAcademic();
  }, [canLoad, homeAuthority, retryAcademic]);

  useEffect(() => {
    if (!refreshPending) return;

    const academicUnavailable =
      academic.kind === "offline" ||
      academic.kind === "timeout" ||
      academic.kind === "server_unavailable" ||
      academic.kind === "error";
    const homeFinished =
      "authorityKey" in home &&
      home.authorityKey === homeAuthority &&
      home.kind !== "loading";
    if (academicUnavailable || homeFinished) setRefreshPending(false);
  }, [academic.kind, home, homeAuthority, refreshPending]);

  useEffect(() => {
    if (
      home.kind !== "context_mismatch" ||
      !homeAuthority ||
      home.authorityKey !== homeAuthority ||
      reconciledAuthority.current === homeAuthority
    ) {
      return;
    }

    reconciledAuthority.current = homeAuthority;
    void retryAcademic();
  }, [home, homeAuthority, retryAcademic]);

  useEffect(() => () => controller.invalidate(), [controller]);

  const refreshControlEnabled = Boolean(homeAuthority && canLoad);
  const refreshing =
    refreshPending ||
    (home.kind === "loading" && home.authorityKey === homeAuthority);

  const renderSurface = (content: ReactNode) => (
    <ProductSurface
      title="Inicio"
      description="Tu punto de entrada a Los Apuntes, con el contexto académico revalidado por el servidor antes de alimentar las superficies de producto."
      onRefresh={refreshControlEnabled ? refresh : undefined}
      refreshing={refreshing}
    >
      {safeToRenderAcademic ? <AcademicContextCard /> : null}
      {content}
    </ProductSurface>
  );

  if (!canLoad || !homeAuthority) {
    if (
      academic.kind === "offline" ||
      academic.kind === "timeout" ||
      academic.kind === "server_unavailable" ||
      academic.kind === "error"
    ) {
      return renderSurface(
        <View style={styles.card}>
          <Text style={styles.copy}>
            El inicio espera a que el servidor vuelva a validar tu contexto.
          </Text>
        </View>,
      );
    }
    return renderSurface(<LoadingCard />);
  }

  const currentHome =
    "authorityKey" in home && home.authorityKey === homeAuthority ? home : null;
  const data: PilotHomeResponse | null =
    currentHome?.kind === "ready"
      ? currentHome.data
      : currentHome?.kind === "loading"
        ? (currentHome.previousData ?? null)
        : null;

  if (currentHome?.kind === "context_mismatch") {
    return renderSurface(
      <RetryCard
        message="El servidor informó un contexto distinto. Estamos revalidando antes de mostrar contenido."
        onRetry={() => void retryAcademic()}
      />,
    );
  }

  if (
    currentHome &&
    (currentHome.kind === "offline" ||
      currentHome.kind === "timeout" ||
      currentHome.kind === "server_unavailable" ||
      currentHome.kind === "restricted" ||
      currentHome.kind === "error")
  ) {
    return renderSurface(
      <RetryCard
        message={failureCopy[currentHome.kind] ?? failureCopy.error!}
        onRetry={refresh}
      />,
    );
  }

  if (!data) return renderSurface(<LoadingCard />);

  return renderSurface(
    <View style={styles.content}>
      {currentHome?.kind === "loading" ? <LoadingCard refreshing /> : null}
      {data.academic.currentSubjectIds.length === 0 &&
      data.homeFeed.kind === "subjects" ? (
        <View style={styles.card}>
          <Text style={styles.title}>Todavía no hay materias actuales</Text>
          <Text style={styles.copy}>
            El inicio no inventa un contexto: cuando haya participaciones
            académicas válidas, el servidor podrá priorizar esos recursos y
            preguntas.
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir notificaciones, ${data.notifications.unreadCount} sin leer`}
        onPress={() => router.push("/notifications")}
        style={({ pressed }) => [
          styles.notificationsCard,
          pressed && styles.notificationsPressed,
        ]}
      >
        <View style={styles.notificationsCopy}>
          <Text style={styles.title}>Notificaciones</Text>
          <Text style={styles.copy}>
            {data.notifications.unreadCount === 1
              ? "Tenés 1 notificación sin leer."
              : `Tenés ${data.notifications.unreadCount} notificaciones sin leer.`}
          </Text>
        </View>
        <Text style={styles.notificationsCount}>
          {data.notifications.unreadCount}
        </Text>
      </Pressable>
      <FeedSection
        title={
          data.homeFeed.kind === "community"
            ? "Universidad y comunidad"
            : "Mis materias"
        }
        feed={data.homeFeed}
      />
      <FeedSection title="Para vos" feed={data.forYou} />
      {data.forYou.effectiveSignals.relationWindowTruncated ? (
        <Text style={styles.moreCopy}>
          La selección de personas usa una muestra acotada de tu red.
        </Text>
      ) : null}
    </View>,
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  notificationsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  notificationsPressed: {
    backgroundColor: "#f0eff6",
  },
  notificationsCopy: {
    flex: 1,
    gap: 6,
  },
  notificationsCount: {
    minWidth: 38,
    borderRadius: 19,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "#eeeaf8",
    color: "#43376a",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5b5b66",
  },
  inline: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  retryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  retryLabel: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
  feedItem: {
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  itemKind: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6c5b91",
    textTransform: "uppercase",
  },
  itemTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  itemMeta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
  moreCopy: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
});
