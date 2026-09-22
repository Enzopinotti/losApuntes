import assert from 'node:assert/strict';

const mailpitBaseUrl =
  process.env.LOSAPUNTES_MAILPIT_BASE_URL ?? 'http://127.0.0.1:8025';

const REQUEST_TIMEOUT_MS = 5_000;
const WAIT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;
const ACTION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mailpitJson(path) {
  const response = await fetch(new URL(path, mailpitBaseUrl), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Mailpit request failed with status ${response.status}`);
  }

  return response.json();
}

export async function waitForMailpit() {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      await mailpitJson('/api/v1/messages');
      return;
    } catch {
      await delay(POLL_INTERVAL_MS);
    }
  }

  throw new Error('Mailpit API did not become ready in time');
}

export async function waitForMail(to, subject, bodyIncludes) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  const query = encodeURIComponent(`to:${to}`);

  while (Date.now() < deadline) {
    try {
      const search = await mailpitJson(
        `/api/v1/search?query=${query}&limit=50`,
      );
      const messages = Array.isArray(search.messages) ? search.messages : [];
      const matches = messages.filter((message) => message.Subject === subject);

      for (const match of matches) {
        if (!match?.ID) continue;

        const message = await mailpitJson(
          `/api/v1/message/${encodeURIComponent(match.ID)}`,
        );

        if (!bodyIncludes) {
          return message;
        }

        const body = [
          typeof message.Text === 'string' ? message.Text : '',
          typeof message.HTML === 'string' ? message.HTML : '',
        ].join('\n');

        if (body.includes(bodyIncludes)) {
          return message;
        }
      }
    } catch {
      // Delivery/indexing is asynchronous. Retry without leaking message data.
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(
    bodyIncludes
      ? `Expected email was not captured: ${subject} / ${bodyIncludes}`
      : `Expected email was not captured: ${subject}`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
}

export function extractActionToken(message, pathname) {
  const body = [
    typeof message.Text === 'string' ? message.Text : '',
    typeof message.HTML === 'string' ? message.HTML : '',
  ].join('\n');
  const pattern = new RegExp(
    `${escapeRegExp(pathname)}\\?token=([A-Za-z0-9_-]{43})`,
  );
  const token = body.match(pattern)?.[1];

  assert.match(
    token ?? '',
    ACTION_TOKEN,
    `captured email must contain a valid token for ${pathname}`,
  );

  return token;
}
