import {
  ActivityIndicator,
  AppState,
  Pressable,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useIsFocused, useRouter } from "expo-router";
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

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { AcademicContextCard } from "@/features/academic/academic-context-card";
import { ProductSurface } from "@/features/navigation/product-surface";
import { mobileAuthenticatedApi } from "@/features/session/session-runtime";
import { useSession } from "@/features/session/session-provider";

import {
  academicContextBelongsToSession,
  academicContextSignature,
  canLoadMoreHomeFeed,
  shouldAutomaticallyLoadHomeFeed,
  MobileHomeController,
  type HomeFeedScrollMetrics,
  type HomeFeedSection,
  type HomePageStatus,
  type MobileHomeSnapshot,
} from "./home-controller";
import {
  hasActionableHomeContent,
  homeFeedItemAction,
  homeFeedExploreAction,
  homeFirstValueActions,
  type HomeFeedItemAction,
  type HomeFeedExploreAction,
  type HomeFirstValueAction,
} from "./home-first-value";
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

const publishedDateLabel = (createdAt: string): string => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

function FeedItemRow({
  item,
  onOpen,
}: {
  item: FeedItem;
  onOpen: (action: HomeFeedItemAction) => void;
}) {
  const action = homeFeedItemAction(item);
  const author = sourceLabel(item);
  const content = (
    <>
      <View style={styles.itemHeader}>
        <View accessible={false} style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {author.trim().slice(0, 1).toLocaleUpperCase("es-AR") || "·"}
          </Text>
        </View>
        <View style={styles.itemAuthor}>
          <Text numberOfLines={1} style={styles.itemAuthorName}>
            {author}
          </Text>
          <Text style={styles.itemKind}>
            {itemKindLabel(item)} · {publishedDateLabel(item.createdAt)}
          </Text>
        </View>
      </View>
      <Text style={styles.itemTitle}>{item.title}</Text>
      {item.academic.subject ? (
        <Text style={styles.itemMeta}>{item.academic.subject.name}</Text>
      ) : null}
      {item.summary ? (
        <Text numberOfLines={3} style={styles.copy}>
          {item.summary}
        </Text>
      ) : null}
      {action ? (
        <Text style={styles.actionLabel}>
          {item.type === "resource" ? "Abrir apunte" : "Abrir pregunta"}
        </Text>
      ) : null}
    </>
  );

  if (!action) return <View style={styles.feedItem}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      accessibilityHint={action.accessibilityHint}
      onPress={() => onOpen(action)}
      style={({ pressed }) => [
        styles.feedItem,
        styles.feedItemAction,
        pressed && styles.feedItemPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function FeedSection({
  title,
  feed,
  surface,
  onOpen,
  onExplore,
  onRetryMore,
  onRefresh,
  pageStatus,
  refreshing,
}: {
  title: string;
  feed: FeedPageResponse;
  surface: "subjects" | "community" | "for_you";
  onOpen: (action: HomeFeedItemAction) => void;
  onExplore: (action: HomeFeedExploreAction) => void;
  onRetryMore: () => void;
  onRefresh: () => void;
  pageStatus: HomePageStatus | undefined;
  refreshing: boolean;
}) {
  const limitReached = Boolean(feed.nextCursor) && !canLoadMoreHomeFeed(feed);
  const exploreAction = homeFeedExploreAction(
    surface,
    Boolean(feed.nextCursor),
  );
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {feed.items.length === 0 ? (
        <Text style={styles.copy}>
          Todavía no hay resultados en esta tanda.
        </Text>
      ) : (
        feed.items.map((item) => (
          <FeedItemRow
            key={`${item.type}:${item.id}`}
            item={item}
            onOpen={onOpen}
          />
        ))
      )}
      {pageStatus?.loading ? (
        <View style={styles.inline}>
          <ActivityIndicator accessibilityLabel={`Cargando ${title}`} />
          <Text style={styles.copy}>Buscando más contenido…</Text>
        </View>
      ) : null}
      {pageStatus?.error ? (
        <View style={styles.pageError}>
          <Text accessibilityRole="alert" style={styles.error}>
            {pageStatus.error}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              pageStatus.requiresRefresh
                ? `Actualizar Inicio para continuar ${title}`
                : `Reintentar carga de ${title}`
            }
            disabled={refreshing}
            onPress={pageStatus.requiresRefresh ? onRefresh : onRetryMore}
            style={({ pressed }) => [
              styles.firstValueAction,
              pressed && styles.firstValueActionPressed,
            ]}
          >
            <Text style={styles.firstValueActionLabel}>
              {pageStatus.requiresRefresh ? "Actualizar Inicio" : "Reintentar"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {exploreAction ? (
        <View style={styles.feedExplore}>
          <Text style={styles.moreCopy}>
            {limitReached
              ? "En Inicio ya no entra otra tanda completa. Podés seguir explorando en otra sección."
              : "También podés explorar contenido en otra sección sin continuar esta tanda."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={exploreAction.accessibilityLabel}
            accessibilityHint={exploreAction.accessibilityHint}
            onPress={() => onExplore(exploreAction)}
            style={({ pressed }) => [
              styles.firstValueAction,
              pressed && styles.firstValueActionPressed,
            ]}
          >
            <Text style={styles.firstValueActionLabel}>
              {exploreAction.label}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {feed.stopReason === "natural_break" ? (
        <Text style={styles.moreCopy}>
          El servidor terminó esta tanda en una pausa natural.
        </Text>
      ) : null}
    </View>
  );
}

function FirstValueCard({
  hasCurrentSubject,
  onNavigate,
}: {
  hasCurrentSubject: boolean;
  onNavigate: (action: HomeFirstValueAction) => void;
}) {
  const actions = homeFirstValueActions(hasCurrentSubject);

  return (
    <View style={styles.firstValueCard}>
      <Text accessibilityRole="header" style={styles.title}>
        {hasCurrentSubject
          ? "No encontraste recursos o preguntas en estas tandas"
          : "Elegí una materia actual o empezá por Buscar"}
      </Text>
      <Text style={styles.copy}>
        {hasCurrentSubject
          ? "Buscá otros apuntes o iniciá una pregunta sobre tu materia. Cuando abras un recurso, vas a poder guardarlo desde su detalle."
          : "Podés buscar apuntes ahora. Si el servidor ya reconoce una participación académica válida, elegí una materia actual en Contexto académico para ver contenido asociado y habilitar preguntas."}
      </Text>
      <View style={styles.firstValueActions}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            accessibilityHint={action.accessibilityHint}
            onPress={() => onNavigate(action)}
            style={({ pressed }) => [
              styles.firstValueAction,
              pressed && styles.firstValueActionPressed,
            ]}
          >
            <Text style={styles.firstValueActionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
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
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const { snapshot: academic, retry: retryAcademic } = useAcademicContext();
  const controller = useMemo(
    () => new MobileHomeController(mobileAuthenticatedApi),
    [],
  );
  const [home, setHome] = useState<MobileHomeSnapshot>(
    controller.getSnapshot(),
  );
  const [activeFeed, setActiveFeed] = useState<HomeFeedSection>("home");
  const [appState, setAppState] = useState(AppState.currentState);
  const [refreshPending, setRefreshPending] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsets = useRef<Record<HomeFeedSection, number>>({
    home: 0,
    for_you: 0,
  });
  const scrollMetrics = useRef<Record<HomeFeedSection, HomeFeedScrollMetrics>>({
    home: { offsetY: 0, viewportHeight: 0, contentHeight: 0 },
    for_you: { offsetY: 0, viewportHeight: 0, contentHeight: 0 },
  });
  const scrollMetricsFeedVersion = useRef<
    Record<HomeFeedSection, string | null>
  >({ home: null, for_you: null });
  const scrollAuthority = useRef<string | null>(null);
  const reconciledAuthority = useRef<string | null>(null);
  const resetHomeFeedSession = useCallback(() => {
    scrollOffsets.current = { home: 0, for_you: 0 };
    scrollMetrics.current = {
      home: { offsetY: 0, viewportHeight: 0, contentHeight: 0 },
      for_you: { offsetY: 0, viewportHeight: 0, contentHeight: 0 },
    };
    scrollMetricsFeedVersion.current = { home: null, for_you: null };
    setActiveFeed("home");
    requestAnimationFrame(() =>
      scrollViewRef.current?.scrollTo({ y: 0, animated: false }),
    );
  }, []);

  const openFeedItem = useCallback(
    (action: HomeFeedItemAction) => router.push(action.href),
    [router],
  );
  const navigateFirstValueAction = useCallback(
    (action: HomeFirstValueAction) => {
      if (action.navigation === "navigate") {
        router.navigate(action.href);
        return;
      }
      router.push(action.href);
    },
    [router],
  );
  const navigateFeedExplore = useCallback(
    (action: HomeFeedExploreAction) => router.navigate(action.href),
    [router],
  );

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
  useEffect(() => {
    if (scrollAuthority.current === homeAuthority) return;
    scrollAuthority.current = homeAuthority;
    resetHomeFeedSession();
  }, [homeAuthority, resetHomeFeedSession]);
  const activeHomeAuthority = activeNavigationAuthorityKey(
    homeAuthority,
    isFocused,
    appState,
  );
  const loadMoreFeed = useCallback(
    (section: HomeFeedSection) => {
      if (!activeHomeAuthority) return;
      void controller.loadMore(activeHomeAuthority, section);
    },
    [activeHomeAuthority, controller],
  );

  const expectedContext: AcademicCurrentContext | null =
    academicData?.context ?? null;
  const contextSignature = academicContextSignature(expectedContext);
  const canLoad =
    Boolean(activeHomeAuthority) &&
    Boolean(academicData) &&
    (academic.kind === "ready" || academic.kind === "no_context");
  const readyHome =
    home.kind === "ready" && home.authorityKey === activeHomeAuthority
      ? home
      : null;
  const activeFeedData = readyHome
    ? activeFeed === "home"
      ? readyHome.data.homeFeed
      : readyHome.data.forYou
    : null;
  const activeFeedMetricsVersion = activeFeedData
    ? JSON.stringify([
        activeHomeAuthority,
        activeFeed,
        activeFeedData.items.length,
        activeFeedData.items.at(-1)?.type,
        activeFeedData.items.at(-1)?.id,
        activeFeedData.nextCursor,
        activeFeedData.stopReason,
      ])
    : null;
  const maybeLoadMoreActiveFeed = useCallback(() => {
    if (
      !readyHome ||
      !activeHomeAuthority ||
      !activeFeedMetricsVersion ||
      scrollMetricsFeedVersion.current[activeFeed] !== activeFeedMetricsVersion
    ) {
      return;
    }
    const feed =
      activeFeed === "home" ? readyHome.data.homeFeed : readyHome.data.forYou;
    const pageStatus = readyHome.pagination?.[activeFeed];
    if (
      shouldAutomaticallyLoadHomeFeed(
        feed,
        scrollMetrics.current[activeFeed],
        pageStatus,
      )
    ) {
      void controller.loadMore(activeHomeAuthority, activeFeed);
    }
  }, [
    activeFeed,
    activeFeedMetricsVersion,
    activeHomeAuthority,
    controller,
    readyHome,
  ]);
  const onHomeScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const offsetY = Math.max(0, contentOffset.y);
      scrollOffsets.current[activeFeed] = offsetY;
      scrollMetricsFeedVersion.current[activeFeed] = activeFeedMetricsVersion;
      scrollMetrics.current[activeFeed] = {
        offsetY,
        viewportHeight: layoutMeasurement.height,
        contentHeight: contentSize.height,
      };
      maybeLoadMoreActiveFeed();
    },
    [activeFeed, activeFeedMetricsVersion, maybeLoadMoreActiveFeed],
  );
  const onHomeScrollLayout = useCallback(
    (event: LayoutChangeEvent) => {
      scrollMetrics.current[activeFeed] = {
        ...scrollMetrics.current[activeFeed],
        viewportHeight: event.nativeEvent.layout.height,
      };
      maybeLoadMoreActiveFeed();
    },
    [activeFeed, maybeLoadMoreActiveFeed],
  );
  const onHomeContentSizeChange = useCallback(
    (_width: number, height: number) => {
      scrollMetrics.current[activeFeed] = {
        ...scrollMetrics.current[activeFeed],
        offsetY: scrollOffsets.current[activeFeed],
        contentHeight: height,
      };
      scrollMetricsFeedVersion.current[activeFeed] = activeFeedMetricsVersion;
      maybeLoadMoreActiveFeed();
    },
    [activeFeed, activeFeedMetricsVersion, maybeLoadMoreActiveFeed],
  );
  const selectFeed = useCallback(
    (section: HomeFeedSection) => {
      if (section === activeFeed) return;
      setActiveFeed(section);
      const offsetY = scrollOffsets.current[section];
      requestAnimationFrame(() => {
        if (scrollAuthority.current === homeAuthority) {
          scrollViewRef.current?.scrollTo({ y: offsetY, animated: false });
        }
      });
    },
    [activeFeed, homeAuthority],
  );

  useEffect(() => {
    maybeLoadMoreActiveFeed();
  }, [maybeLoadMoreActiveFeed]);

  useEffect(() => {
    if (!canLoad || !activeHomeAuthority) {
      controller.invalidate();
      return;
    }

    void controller.load(activeHomeAuthority, expectedContext);
    return () => controller.invalidate(activeHomeAuthority);
  }, [
    academic.kind,
    activeHomeAuthority,
    canLoad,
    contextSignature,
    controller,
    expectedContext,
  ]);

  const refresh = useCallback(() => {
    if (!canLoad || !activeHomeAuthority) return;
    setRefreshPending(true);
    void retryAcademic();
  }, [activeHomeAuthority, canLoad, retryAcademic]);

  useEffect(() => {
    if (!activeHomeAuthority && refreshPending) {
      setRefreshPending(false);
      return;
    }
    if (!refreshPending) return;

    const academicUnavailable =
      academic.kind === "offline" ||
      academic.kind === "timeout" ||
      academic.kind === "server_unavailable" ||
      academic.kind === "error";
    const homeFinished =
      "authorityKey" in home &&
      home.authorityKey === activeHomeAuthority &&
      home.kind !== "loading";
    if (academicUnavailable || homeFinished) setRefreshPending(false);
  }, [academic.kind, activeHomeAuthority, home, refreshPending]);

  useEffect(() => {
    if (
      home.kind !== "context_mismatch" ||
      !activeHomeAuthority ||
      home.authorityKey !== activeHomeAuthority ||
      reconciledAuthority.current === activeHomeAuthority
    ) {
      return;
    }

    reconciledAuthority.current = activeHomeAuthority;
    void retryAcademic();
  }, [activeHomeAuthority, home, retryAcademic]);

  useEffect(() => () => controller.invalidate(), [controller]);

  const refreshControlEnabled = Boolean(activeHomeAuthority && canLoad);
  const refreshing =
    refreshPending ||
    (home.kind === "loading" && home.authorityKey === activeHomeAuthority);

  const renderSurface = (content: ReactNode) => (
    <ProductSurface
      title="Inicio"
      description="Contenido académico y comunidad, según tu contexto."
      onRefresh={refreshControlEnabled ? refresh : undefined}
      refreshing={refreshing}
      scrollViewRef={scrollViewRef}
      onScroll={onHomeScroll}
      onScrollLayout={onHomeScrollLayout}
      onContentSizeChange={onHomeContentSizeChange}
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
    "authorityKey" in home && home.authorityKey === activeHomeAuthority
      ? home
      : null;
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

  const homeFeedTitle =
    data.homeFeed.kind === "community" ? "Comunidad" : "Mis materias";
  const activeFeedPageStatus =
    currentHome?.kind === "ready"
      ? currentHome.pagination?.[activeFeed]
      : undefined;

  return renderSurface(
    <View style={styles.content}>
      {currentHome?.kind === "loading" ? <LoadingCard refreshing /> : null}
      {!hasActionableHomeContent(data.homeFeed, data.forYou) ? (
        <FirstValueCard
          hasCurrentSubject={data.academic.currentSubjectIds.length > 0}
          onNavigate={navigateFirstValueAction}
        />
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
      <View style={styles.feedSelector}>
        <Text style={styles.feedSelectorLabel}>Tu feed</Text>
        <View style={styles.feedOptions}>
          {(
            [
              { section: "home", label: homeFeedTitle },
              { section: "for_you", label: "Para vos" },
            ] as const
          ).map(({ section, label }) => {
            const selected = activeFeed === section;
            return (
              <Pressable
                key={section}
                accessibilityRole="button"
                accessibilityLabel={`Mostrar feed ${label}`}
                accessibilityState={{ selected }}
                onPress={() => selectFeed(section)}
                style={({ pressed }) => [
                  styles.feedOption,
                  selected && styles.feedOptionSelected,
                  pressed && styles.feedOptionPressed,
                ]}
              >
                <Text
                  style={[
                    styles.feedOptionLabel,
                    selected && styles.feedOptionLabelSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {activeFeed === "home" ? (
        <FeedSection
          title={
            data.homeFeed.kind === "community"
              ? "Universidad y comunidad"
              : "Mis materias"
          }
          feed={data.homeFeed}
          surface={data.homeFeed.kind}
          onOpen={openFeedItem}
          onExplore={navigateFeedExplore}
          onRetryMore={() => loadMoreFeed("home")}
          onRefresh={refresh}
          pageStatus={activeFeedPageStatus}
          refreshing={refreshing}
        />
      ) : (
        <FeedSection
          title="Para vos"
          feed={data.forYou}
          surface="for_you"
          onOpen={openFeedItem}
          onExplore={navigateFeedExplore}
          onRetryMore={() => loadMoreFeed("for_you")}
          onRefresh={refresh}
          pageStatus={activeFeedPageStatus}
          refreshing={refreshing}
        />
      )}
      {activeFeed === "for_you" &&
      data.forYou.effectiveSignals.relationWindowTruncated ? (
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
  firstValueCard: {
    gap: 12,
    borderWidth: 1,
    borderColor: "#ded8ed",
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  firstValueActions: {
    gap: 8,
  },
  feedExplore: {
    gap: 8,
  },
  pageError: {
    gap: 8,
  },
  feedSelector: {
    gap: 8,
  },
  feedSelectorLabel: {
    color: "#55555f",
    fontSize: 13,
    fontWeight: "700",
  },
  feedOptions: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#eeedf3",
  },
  feedOption: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 10,
  },
  feedOptionSelected: {
    backgroundColor: "#ffffff",
  },
  feedOptionPressed: {
    opacity: 0.75,
  },
  feedOptionLabel: {
    color: "#55555f",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  feedOptionLabelSelected: {
    color: "#342b4d",
    fontWeight: "800",
  },
  firstValueAction: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#b8b1cb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8f6fc",
  },
  firstValueActionPressed: {
    backgroundColor: "#ebe6f4",
  },
  firstValueActionLabel: {
    color: "#342b4d",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  notificationsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    padding: 14,
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
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  feedItemAction: {
    minHeight: 48,
  },
  feedItemPressed: {
    backgroundColor: "#f8f6fc",
  },
  itemKind: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6c5b91",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#eeeaf8",
  },
  avatarInitial: {
    color: "#43376a",
    fontSize: 15,
    fontWeight: "800",
  },
  itemAuthor: {
    flex: 1,
    gap: 2,
  },
  itemAuthorName: {
    color: "#20202a",
    fontSize: 14,
    fontWeight: "700",
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
  actionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#43366a",
  },
  moreCopy: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
});
