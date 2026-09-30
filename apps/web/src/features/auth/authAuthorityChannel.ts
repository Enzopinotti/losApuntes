const AUTH_AUTHORITY_CHANNEL = "losapuntes:auth-authority:v1";

type AuthorityMessage = {
  type: "authority-changed";
  sourceId: string;
};

const sourceId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const isAuthorityMessage = (value: unknown): value is AuthorityMessage => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AuthorityMessage>;
  return (
    candidate.type === "authority-changed" &&
    typeof candidate.sourceId === "string"
  );
};

export const publishAuthAuthorityChanged = (): void => {
  if (typeof BroadcastChannel === "undefined") return;

  const channel = new BroadcastChannel(AUTH_AUTHORITY_CHANNEL);
  channel.postMessage({
    type: "authority-changed",
    sourceId,
  } satisfies AuthorityMessage);
  channel.close();
};

export const subscribeAuthAuthorityChanged = (
  listener: () => void,
): (() => void) => {
  if (typeof BroadcastChannel === "undefined") return () => undefined;

  const channel = new BroadcastChannel(AUTH_AUTHORITY_CHANNEL);
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!isAuthorityMessage(event.data) || event.data.sourceId === sourceId) {
      return;
    }

    listener();
  };

  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
};
