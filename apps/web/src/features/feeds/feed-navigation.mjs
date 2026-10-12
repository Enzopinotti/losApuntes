const feedViews = new Set(["academic", "for-you"]);
const feedModes = new Set(["balanced", "study", "discover", "community"]);
const feedOrders = new Set(["ranked", "chronological"]);
const homeFeedIntents = new Set(["contextual", "for-you"]);

function isNavigationKey(candidate) {
  return (
    typeof candidate === "string" &&
    candidate.length > 0 &&
    candidate.length <= 128 &&
    !/[\u0000-\u001f]/u.test(candidate)
  );
}

export function feedReturnHref(locationState) {
  if (typeof locationState !== "object" || locationState === null) {
    return null;
  }

  const candidate = locationState.feedReturnTo;
  if (candidate === "/") return candidate;
  if (
    typeof candidate === "string" &&
    /^\/feeds(?:\?[^#\\\u0000-\u001f]*)?$/u.test(candidate)
  ) {
    return candidate;
  }

  return null;
}

export function feedReturnRestoreState(locationState) {
  if (typeof locationState !== "object" || locationState === null) {
    return null;
  }

  const feedReturnTo = feedReturnHref(locationState);
  const feedReturnKey = feedReturnScrollKey(locationState);
  if (!feedReturnTo || !feedReturnKey) return null;

  const homeIntent = feedReturnHomeIntent(locationState);
  return {
    feedRestoreTo: feedReturnTo,
    feedRestoreKey: feedReturnKey,
    ...(feedReturnTo === "/" && homeIntent
      ? { feedRestoreHomeIntent: homeIntent }
      : {}),
  };
}

export function feedReturnScrollKey(locationState) {
  if (typeof locationState !== "object" || locationState === null) {
    return null;
  }

  return isNavigationKey(locationState.feedReturnKey)
    ? locationState.feedReturnKey
    : null;
}

export function feedReturnHomeIntent(locationState) {
  if (typeof locationState !== "object" || locationState === null) {
    return null;
  }

  return homeFeedIntents.has(locationState.feedReturnHomeIntent)
    ? locationState.feedReturnHomeIntent
    : null;
}

export function feedRestoreHomeIntent(locationState, currentHref) {
  if (
    typeof locationState !== "object" ||
    locationState === null ||
    currentHref !== "/" ||
    locationState.feedRestoreTo !== currentHref ||
    !isNavigationKey(locationState.feedRestoreKey)
  ) {
    return null;
  }

  return homeFeedIntents.has(locationState.feedRestoreHomeIntent)
    ? locationState.feedRestoreHomeIntent
    : null;
}

export function feedSelectionFromSearchParams(searchParams) {
  const requestedView = searchParams.get("view");
  const requestedMode = searchParams.get("mode");
  const requestedOrder = searchParams.get("order");

  return {
    view: feedViews.has(requestedView) ? requestedView : "academic",
    mode: feedModes.has(requestedMode) ? requestedMode : "balanced",
    order: feedOrders.has(requestedOrder) ? requestedOrder : "ranked",
  };
}

export function homeFeedHref(intent, homeFeedKind) {
  if (intent === "contextual" && homeFeedKind !== "community") {
    return "/feeds?view=academic";
  }

  const params = new URLSearchParams({
    view: "for-you",
    mode: intent === "contextual" ? "community" : "balanced",
    order: "ranked",
  });

  return `/feeds?${params.toString()}`;
}
