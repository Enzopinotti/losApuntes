import assert from "node:assert/strict";
import test from "node:test";

import type {
  ConnectionView,
  QuestionSearchResponse,
} from "@losapuntes/contracts/social-qa";

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
const emptyConnections = { items: [], nextCursor: null };

const connection = (status: ConnectionView["status"]): ConnectionView => ({
  id: "connection-a",
  status,
  other: { profileId: "profile-a", displayName: "Ada", avatarUrl: null },
  requestedByMe: false,
  incoming: status === "pending",
  respondedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

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
    updateQuestion: async (credential, id, input, signal) => {
      calls.push({
        method: "updateQuestion",
        args: [credential, id, input, signal],
      });
      return { question: {} as never };
    },
    updateAnswer: async (credential, id, input, signal) => {
      calls.push({
        method: "updateAnswer",
        args: [credential, id, input, signal],
      });
      return { answer: {} as never };
    },
    acceptAnswer: async (credential, id, answerId, revision, signal) => {
      calls.push({
        method: "acceptAnswer",
        args: [credential, id, answerId, revision, signal],
      });
      return { question: {} as never };
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
    connections: async (credential, input, signal) => {
      calls.push({ method: "connections", args: [credential, input, signal] });
      return emptyConnections;
    },
    respondConnection: async (credential, id, action, signal) => {
      calls.push({
        method: "respondConnection",
        args: [credential, id, action, signal],
      });
      return {
        connection: connection(action === "accept" ? "accepted" : "declined"),
      };
    },
    disconnectConnection: async (credential, id, signal) => {
      calls.push({
        method: "disconnectConnection",
        args: [credential, id, signal],
      });
    },
    requestConnection: async (credential, profileId, signal) => {
      calls.push({
        method: "requestConnection",
        args: [credential, profileId, signal],
      });
      return { connection: connection("pending") };
    },
    following: async (credential, input, signal) => {
      calls.push({ method: "following", args: [credential, input, signal] });
      return { items: [], nextCursor: null };
    },
    followProfile: async (credential, profileId, signal) => {
      calls.push({
        method: "followProfile",
        args: [credential, profileId, signal],
      });
      return { following: true };
    },
    unfollowProfile: async (credential, profileId, signal) => {
      calls.push({
        method: "unfollowProfile",
        args: [credential, profileId, signal],
      });
    },
    reportQuestion: async (credential, id, input, signal) => {
      calls.push({
        method: "reportQuestion",
        args: [credential, id, input, signal],
      });
      return { report: {} as never };
    },
    reportAnswer: async (credential, id, input, signal) => {
      calls.push({
        method: "reportAnswer",
        args: [credential, id, input, signal],
      });
      return { report: {} as never };
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
  await api.connections(
    { status: "pending", limit: 25, cursor: "opaque-connections" },
    signal,
  );
  await api.respondConnection("connection-a", "accept", signal);
  await api.disconnectConnection("connection-a", signal);
  await api.requestConnection("profile-a", signal);
  await api.following({ limit: 30, cursor: "follow-cursor" }, signal);
  await api.followProfile("profile-a", signal);
  await api.unfollowProfile("profile-a", signal);
  await api.reportQuestion("question-a", { reason: "spam" }, signal);
  await api.reportAnswer(
    "answer-a",
    { reason: "other", details: "detalle" },
    signal,
  );

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
  assert.deepEqual(calls[5], {
    method: "connections",
    args: [
      "secret-session-token",
      { status: "pending", limit: 25, cursor: "opaque-connections" },
      signal,
    ],
  });
  assert.deepEqual(calls[6], {
    method: "respondConnection",
    args: ["secret-session-token", "connection-a", "accept", signal],
  });
  assert.deepEqual(calls[7], {
    method: "disconnectConnection",
    args: ["secret-session-token", "connection-a", signal],
  });
  assert.deepEqual(calls[8], {
    method: "requestConnection",
    args: ["secret-session-token", "profile-a", signal],
  });
  assert.deepEqual(calls[9], {
    method: "following",
    args: [
      "secret-session-token",
      { limit: 30, cursor: "follow-cursor" },
      signal,
    ],
  });
  assert.deepEqual(calls[10], {
    method: "followProfile",
    args: ["secret-session-token", "profile-a", signal],
  });
  assert.deepEqual(calls[11], {
    method: "unfollowProfile",
    args: ["secret-session-token", "profile-a", signal],
  });
  assert.deepEqual(calls[12], {
    method: "reportQuestion",
    args: ["secret-session-token", "question-a", { reason: "spam" }, signal],
  });
  assert.deepEqual(calls[13], {
    method: "reportAnswer",
    args: [
      "secret-session-token",
      "answer-a",
      { reason: "other", details: "detalle" },
      signal,
    ],
  });
});

test("connection transport uses the authenticated paginated Social endpoints", async () => {
  const calls: Array<{ path: string; init?: Record<string, unknown> }> = [];
  const client = {
    request: async (path: string, init?: Record<string, unknown>) => {
      calls.push({ path, ...(init ? { init } : {}) });
      if (path.startsWith("/social/me/connections")) return emptyConnections;
      if (path.startsWith("/social/profiles/")) {
        return { connection: connection("pending") };
      }
      if (path.endsWith("/accept")) {
        return { connection: connection("accepted") };
      }
      return undefined;
    },
  } as unknown as MobileApiClient;
  const transport = new MobileCommunityHttpTransport(client);
  const signal = new AbortController().signal;

  await transport.connections(
    "secret-session-token",
    { status: "pending", limit: 30, cursor: "opaque/cursor" },
    signal,
  );
  await transport.respondConnection(
    "secret-session-token",
    "connection/a",
    "accept",
    signal,
  );
  await transport.disconnectConnection(
    "secret-session-token",
    "connection/a",
    signal,
  );
  await transport.requestConnection(
    "secret-session-token",
    "profile/a",
    signal,
  );
  await transport.following(
    "secret-session-token",
    { limit: 30, cursor: "opaque/cursor" },
    signal,
  );
  await transport.followProfile("secret-session-token", "profile/a", signal);
  await transport.unfollowProfile("secret-session-token", "profile/a", signal);
  await transport.reportQuestion(
    "secret-session-token",
    "question/a",
    { reason: "spam" },
    signal,
  );
  await transport.reportAnswer(
    "secret-session-token",
    "answer/a",
    { reason: "harassment", details: "detalle" },
    signal,
  );

  assert.deepEqual(calls, [
    {
      path: "/social/me/connections?limit=30&status=pending&cursor=opaque%2Fcursor",
      init: { credential: "secret-session-token", signal },
    },
    {
      path: "/social/connections/connection%2Fa/accept",
      init: { method: "POST", credential: "secret-session-token", signal },
    },
    {
      path: "/social/connections/connection%2Fa",
      init: { method: "DELETE", credential: "secret-session-token", signal },
    },
    {
      path: "/social/profiles/profile%2Fa/connections",
      init: { method: "POST", credential: "secret-session-token", signal },
    },
    {
      path: "/social/me/following?limit=30&cursor=opaque%2Fcursor",
      init: { credential: "secret-session-token", signal },
    },
    {
      path: "/social/profiles/profile%2Fa/follow",
      init: { method: "PUT", credential: "secret-session-token", signal },
    },
    {
      path: "/social/profiles/profile%2Fa/follow",
      init: { method: "DELETE", credential: "secret-session-token", signal },
    },
    {
      path: "/questions/question%2Fa/reports",
      init: {
        method: "POST",
        credential: "secret-session-token",
        body: { reason: "spam" },
        signal,
      },
    },
    {
      path: "/answers/answer%2Fa/reports",
      init: {
        method: "POST",
        credential: "secret-session-token",
        body: { reason: "harassment", details: "detalle" },
        signal,
      },
    },
  ]);
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
    updateQuestion: async () => ({ question: {} as never }),
    updateAnswer: async () => ({ answer: {} as never }),
    acceptAnswer: async () => ({ question: {} as never }),
    notifications: async () => emptyNotifications,
    markNotificationRead: async () => ({ read: true }),
    markAllNotificationsRead: async () => ({ updated: 0 }),
    connections: async () => emptyConnections,
    respondConnection: async () => ({ connection: connection("pending") }),
    disconnectConnection: async () => undefined,
    requestConnection: async () => ({ connection: connection("pending") }),
    following: async () => ({ items: [], nextCursor: null }),
    followProfile: async () => ({ following: true }),
    unfollowProfile: async () => undefined,
    reportQuestion: async () => ({ report: {} as never }),
    reportAnswer: async () => ({ report: {} as never }),
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
    updateQuestion: async () => ({ question: {} as never }),
    updateAnswer: async () => ({ answer: {} as never }),
    acceptAnswer: async () => ({ question: {} as never }),
    notifications: async () => emptyNotifications,
    markNotificationRead: async () => ({ read: true }),
    markAllNotificationsRead: async () => ({ updated: 0 }),
    connections: async () => emptyConnections,
    respondConnection: async () => ({ connection: connection("pending") }),
    disconnectConnection: async () => undefined,
    requestConnection: async () => ({ connection: connection("pending") }),
    following: async () => ({ items: [], nextCursor: null }),
    followProfile: async () => ({ following: true }),
    unfollowProfile: async () => undefined,
    reportQuestion: async () => ({ report: {} as never }),
    reportAnswer: async () => ({ report: {} as never }),
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
    status: "closed",
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
  assert.equal(questionUrl.searchParams.get("status"), "closed");
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

test("Q&A mutation transport sends exact revision payloads to existing authenticated routes", async () => {
  const calls: Array<{ path: string; options: Record<string, unknown> }> = [];
  const client = {
    request: async <T>(path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return {} as T;
    },
  } as unknown as MobileApiClient;
  const transport = new MobileCommunityHttpTransport(client);
  const signal = new AbortController().signal;
  const credential = "secret-session-token";

  await transport.updateQuestion(
    credential,
    "question/a",
    { expectedRevision: 4, title: "Una pregunta nueva" },
    signal,
  );
  await transport.updateQuestion(
    credential,
    "question/a",
    { expectedRevision: 5, status: "closed" },
    signal,
  );
  await transport.updateAnswer(
    credential,
    "answer/a",
    { expectedRevision: 2, body: "Una respuesta corregida" },
    signal,
  );
  await transport.acceptAnswer(credential, "question/a", "answer/a", 6, signal);

  assert.deepEqual(calls, [
    {
      path: "/questions/question%2Fa",
      options: {
        method: "PATCH",
        credential,
        body: { expectedRevision: 4, title: "Una pregunta nueva" },
        signal,
      },
    },
    {
      path: "/questions/question%2Fa",
      options: {
        method: "PATCH",
        credential,
        body: { expectedRevision: 5, status: "closed" },
        signal,
      },
    },
    {
      path: "/answers/answer%2Fa",
      options: {
        method: "PATCH",
        credential,
        body: { expectedRevision: 2, body: "Una respuesta corregida" },
        signal,
      },
    },
    {
      path: "/questions/question%2Fa/answers/answer%2Fa/accept",
      options: {
        method: "POST",
        credential,
        body: { expectedRevision: 6 },
        signal,
      },
    },
  ]);
});
