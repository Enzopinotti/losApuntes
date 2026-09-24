import { randomUUID } from "expo-crypto";

export type AuthActionKind = "email_verification" | "password_recovery";

const ACTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const HANDLE_PATTERN = /^[0-9a-f-]{36}$/u;
const MAX_ENTRIES = 4;
const ENTRY_TTL_MS = 5 * 60 * 1000;

type Entry = {
  kind: AuthActionKind;
  token: string;
  expiresAt: number;
};

export interface AuthActionTokenVault {
  capture(kind: AuthActionKind, token: string, now?: number): string | null;
  take(handle: string, kind: AuthActionKind, now?: number): string | null;
  clear(): void;
}

export const createAuthActionTokenVault = (): AuthActionTokenVault => {
  const entries = new Map<string, Entry>();

  const sweep = (now: number) => {
    for (const [handle, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(handle);
    }
  };

  return {
    capture(kind, token, now = Date.now()) {
      sweep(now);
      if (!ACTION_TOKEN_PATTERN.test(token)) return null;

      while (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next().value as string | undefined;
        if (!oldest) break;
        entries.delete(oldest);
      }

      const handle = randomUUID();
      entries.set(handle, {
        kind,
        token,
        expiresAt: now + ENTRY_TTL_MS,
      });
      return handle;
    },

    take(handle, kind, now = Date.now()) {
      sweep(now);
      if (!HANDLE_PATTERN.test(handle)) return null;

      const entry = entries.get(handle);
      if (!entry || entry.kind !== kind) return null;

      entries.delete(handle);
      return entry.token;
    },

    clear() {
      entries.clear();
    },
  };
};
