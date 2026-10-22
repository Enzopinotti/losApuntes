export function persistentStudyCollectionsVisible(raw: string | undefined) {
  return raw === "true";
}

export const MOBILE_PERSISTENT_COLLECTIONS_VISIBLE =
  persistentStudyCollectionsVisible(
    process.env.EXPO_PUBLIC_STUDY_COLLECTIONS_ENABLED,
  );
