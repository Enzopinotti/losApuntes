import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionSearchResponse } from "@losapuntes/contracts/social-qa";

import {
  MobileCommunityApi,
  MobileCommunityHttpTransport,
  type CommunityTransport,
  type MobileNotificationPage,
} from "../src/features/community/community-api";
import type { SessionController } from "../src/features/session/session-controller";
import {
  ApiRequestError,
  type MobileApiClient,
} from "../src/services/api/client";

function sessionHarness() {
  let snapshot: { credential: string; generation: number } | null = {
    credential: "secret-session-token",
    generation: 3,
  };
  let authoritative = true;
  let invalidated = false;
  const session = {
    getCredentialSnapshot: () => snapshot,
    isCredentialAuthoritative: () => authoritative,
    invalidateIfAuthoritative: async () => {
      invalidated = true;
    },
    restrictIfAuthoritative: async () => undefined,
  } as unknown as SessionController;
  return {
    session,
    clear() {
      snapshot = null;
    },
    setAuthoritative(value: boolean) {
      authoritative = value;
    },
    wasInvalidated: () => invalidated,
  };
}

const emptyQuestions: QuestionSearchResponse = {
  items: [],
  nextCursor: null,
};
const emptyNotifications: MobileNotificationPage = {
  items: [],
  nextCursor: null,
};

test("request methods retain the bearer credential and server cursor contract", async () => {
  const harness = sessionHarness();
  const calls: Array<{
    method: string;
    args: unknown[];
  }> = [];
  const transport: CommunityTransport = {
    questions: async (credential, input, signal) => {
      calls.push({ method: "questions", args: [credential, input, signal] });
      return emptyQuestions;
    },
    question: async (credential, id, signal) => {
      calls.push({ method: "question", args: [credential, id, signal] });
      return {
        question: {} as never,
        answers: [],
        answersNextCursor: null,
        answersLimit: 25,
      };
    },
    answers: async (credential, id, cursor, limit, signal) => {
      calls.push({
        method: "answers",
        args: [credential, id, cursor, limit, signal],
      });
      return { items: [], nextCursor: null };
    },
    createQuestion: async (credential, input, signal) => {
      calls.push({
        method: "createQuestion",
        args: [credential, input, signal],
      });
      return { question: {} as never };
    },
    createAnswer: async (credential, id, input, signal) => {
      calls.push({
        method: "createAnswer",
        args: [credential, id, input, signal],
      });
      return { answer: {} as never };
    },
    notifications: async (credential, input, signal) => {
      calls.push({
        method: "notifications",
        args: [credential, input, signal],
      });
      return emptyNotifications;
    },
    markNotificationRead: async (credential, id, signal) => {
      calls.push({
        method: "markNotificationRead",
        args: [credential, id, signal],
      });
      return { read: true };
    },
    markAllNotificationsRead: async (credential, signal) => {
      calls.push({
        method: "markAllNotificationsRead",
        args: [credential, signal],
      });
      return { updated: 2 };
    },
  };
  const api = new MobileCommunityApi(harness.session, transport);
  const signal = new AbortController().signal;

  await api.questions(
    { subjectId: "subject-a", limit: 25, cursor: "opaque" },
    signal,
  );
  await api.answers("question-a", "answer-cursor", 25, signal);
  await api.notifications(
    { unreadOnly: true, limit: 30, cursor: "notification-cursor" },
    signal,
  );
  await api.markNotificationRead("notification-a", signal);
  await api.markAllNotificationsRead(signal);

  assert.deepEqual(calls[0], {
    method: "questions",
    args: [
      "secret-session-token",
      { subjectId: "subject-a", limit: 25, cursor: "opaque" },
      signal,
    ],
  });
  assert.deepEqual(calls[1], {
    method: "answers",
    args: ["secret-session-token", "question-a", "answer-cursor", 25, signal],
  });
  assert.deepEqual(calls[2], {
    method: "notifications",
    args: [
      "secret-session-token",
      { unreadOnly: true, limit: 30, cursor: "notification-cursor" },
      signal,
    ],
  });
  assert.deepEqual(calls[3], {
    method: "markNotificationRead",
    args: ["secret-session-token", "notification-a", signal],
  });
  assert.deepEqual(calls[4], {
    method: "markAllNotificationsRead",
    args: ["secret-session-token", signal],
  });
});

test("requires the current session and never silently downgrades to anonymous", async () => {
  const harness = sessionHarness();
  harness.clear();
  let called = false;
  const transport: CommunityTransport = {
    questions: async () => {
      called = true;
      return emptyQuestions;
    },
    question: async () => {
      throw new Error("unexpected");
    },
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => {
      throw new Error("unexpected");
    },
    createAnswer: async () => {
      throw new Error("unexpected");
    },
    notifications: async () => emptyNotifications,
    markNotificationRead: async () => ({ read: true }),
    markAllNotificationsRead: async () => ({ updated: 0 }),
  };

  await assert.rejects(
    new MobileCommunityApi(harness.session, transport).questions({ limit: 25 }),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.kind === "unauthorized" &&
      error.code === "AUTHENTICATION_REQUIRED",
  );
  assert.equal(called, false);
});

test("fences successful responses when the session generation changed", async () => {
  const harness = sessionHarness();
  let resolve!: (value: QuestionSearchResponse) => void;
  const pending = new Promise<QuestionSearchResponse>((done) => {
    resolve = done;
  });
  const transport: CommunityTransport = {
    questions: async () => pending,
    question: async () => {
      throw new Error("unexpected");
    },
    answers: async () => ({ items: [], nextCursor: null }),
    createQuestion: async () => {
      throw new Error("unexpected");
    },
    createAnswer: async () => {
      throw new Error("unexpected");
    },
    notifications: async () => emptyNotifications,
    markNotificationRead: async () => ({ read: true }),
    markAllNotificationsRead: async () => ({ updated: 0 }),
  };
  const request = new MobileCommunityApi(harness.session, transport).questions({
    limit: 25,
  });
  harness.setAuthoritative(false);
  resolve(emptyQuestions);

  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.kind === "unauthorized" &&
      error.code === "STALE_SESSION_AUTHORITY",
  );
  assert.equal(harness.wasInvalidated(), true);
});

test("encodes public question API paths and includes only server-supported pagination fields", async () => {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  const client = {
    request: async <T>(path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return emptyQuestions as T;
    },
  } as unknown as MobileApiClient;
  const transport = new MobileCommunityHttpTransport(client);

  await transport.questions("token", {
    q: "integrales impropias",
    subjectId: "subject / one",
    limit: 25,
    cursor: "opaque+/=",
  });
  await transport.answers("token", "question / one", "answer-cursor", 17);
  await transport.notifications("token", {
    unreadOnly: true,
    limit: 500,
    cursor: "notification+/cursor",
  });
  await transport.markNotificationRead("token", "notification / one");
  await transport.markAllNotificationsRead("token");

  const questionUrl = new URL(calls[0]!.path, "https://api.example");
  assert.equal(questionUrl.pathname, "/questions");
  assert.equal(questionUrl.searchParams.get("q"), "integrales impropias");
  assert.equal(questionUrl.searchParams.get("subjectId"), "subject / one");
  assert.equal(questionUrl.searchParams.get("limit"), "25");
  assert.equal(questionUrl.searchParams.get("cursor"), "opaque+/=");
  assert.deepEqual(calls[0]!.options, { credential: "token" });

  const answerUrl = new URL(calls[1]!.path, "https://api.example");
  assert.equal(answerUrl.pathname, "/questions/question%20%2F%20one/answers");
  assert.equal(answerUrl.searchParams.get("cursor"), "answer-cursor");
  assert.equal(answerUrl.searchParams.get("limit"), "17");

  const notificationsUrl = new URL(calls[2]!.path, "https://api.example");
  assert.equal(notificationsUrl.pathname, "/notifications");
  assert.equal(notificationsUrl.searchParams.get("unreadOnly"), "true");
  assert.equal(notificationsUrl.searchParams.get("limit"), "100");
  assert.equal(
    notificationsUrl.searchParams.get("cursor"),
    "notification+/cursor",
  );
  assert.deepEqual(calls[2]!.options, { credential: "token" });

  assert.equal(calls[3]!.path, "/notifications/notification%20%2F%20one/read");
  assert.deepEqual(calls[3]!.options, {
    method: "PATCH",
    credential: "token",
  });
  assert.equal(calls[4]!.path, "/notifications/read-all");
  assert.deepEqual(calls[4]!.options, {
    method: "POST",
    credential: "token",
  });
});
