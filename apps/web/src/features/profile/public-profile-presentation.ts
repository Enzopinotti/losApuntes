const ACCENT_PRESETS = [
  "default",
  "indigo",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;

const COVER_PRESETS = ["none", "gradient", "paper", "campus"] as const;

type AccentPreset = (typeof ACCENT_PRESETS)[number];
type CoverPreset = (typeof COVER_PRESETS)[number];

export function publicProfilePresentationPresets(
  accentPreset: string,
  coverPreset: string,
): { accentPreset: AccentPreset; coverPreset: CoverPreset } {
  return {
    accentPreset: ACCENT_PRESETS.includes(accentPreset as AccentPreset)
      ? (accentPreset as AccentPreset)
      : "default",
    coverPreset: COVER_PRESETS.includes(coverPreset as CoverPreset)
      ? (coverPreset as CoverPreset)
      : "none",
  };
}
