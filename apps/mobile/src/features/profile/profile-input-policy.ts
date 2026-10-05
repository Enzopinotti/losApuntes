export type ProfileListField =
  "languages" | "skills" | "interests" | "helpTopics" | "learningTopics";

type ProfileListRule = {
  label: string;
  maxItems: number;
  minLength: number;
  maxLength: number;
};

export const PROFILE_LIST_RULES: Record<ProfileListField, ProfileListRule> = {
  languages: {
    label: "Idiomas",
    maxItems: 10,
    minLength: 2,
    maxLength: 35,
  },
  skills: {
    label: "Habilidades",
    maxItems: 30,
    minLength: 1,
    maxLength: 60,
  },
  interests: {
    label: "Intereses",
    maxItems: 30,
    minLength: 1,
    maxLength: 60,
  },
  helpTopics: {
    label: "Temas en los que podés ayudar",
    maxItems: 20,
    minLength: 1,
    maxLength: 100,
  },
  learningTopics: {
    label: "Temas que querés aprender",
    maxItems: 20,
    minLength: 1,
    maxLength: 100,
  },
};

export type ProfileListParseResult =
  { ok: true; values: string[] } | { ok: false; message: string };

export function parseProfileListInput(
  field: ProfileListField,
  value: string,
): ProfileListParseResult {
  const rule = PROFILE_LIST_RULES[field];
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of value.split(",")) {
    const item = raw.normalize("NFC").trim();
    if (!item) continue;

    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(item);
  }

  if (values.length > rule.maxItems) {
    return {
      ok: false,
      message: `${rule.label}: máximo ${rule.maxItems} valores.`,
    };
  }

  const invalid = values.find(
    (item) => item.length < rule.minLength || item.length > rule.maxLength,
  );
  if (invalid) {
    return {
      ok: false,
      message:
        rule.minLength === rule.maxLength
          ? `${rule.label}: cada valor debe tener ${rule.maxLength} caracteres.`
          : `${rule.label}: cada valor debe tener entre ${rule.minLength} y ${rule.maxLength} caracteres.`,
    };
  }

  return { ok: true, values };
}
