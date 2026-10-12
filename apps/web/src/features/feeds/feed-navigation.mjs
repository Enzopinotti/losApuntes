const feedViews = new Set(["academic", "for-you"]);
const feedModes = new Set(["balanced", "study", "discover", "community"]);
const feedOrders = new Set(["ranked", "chronological"]);

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
