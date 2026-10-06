import { afterEach, describe, expect, it } from "vitest";
import {
  isTransportFailure,
  MessagingError,
  onMessage,
  sendToBackground,
} from "@/lib/messaging/client";
import type { ResponseEnvelope } from "@/lib/messaging/protocol";

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ResponseEnvelope<unknown>) => void,
) => boolean | undefined;

const listeners = new Set<RuntimeListener>();

function installChrome(sendMessage: (message: unknown) => Promise<unknown>): void {
  const runtime = {
    sendMessage,
    onMessage: {
      addListener: (listener: RuntimeListener) => {
        listeners.add(listener);
      },
      removeListener: (listener: RuntimeListener) => {
        listeners.delete(listener);
      },
    },
  };
  (globalThis as { chrome?: unknown }).chrome = { runtime };
}

function deliver(message: unknown): Promise<ResponseEnvelope<unknown> | undefined> {
  return new Promise((resolve) => {
    let answered = false;
    let handled = false;
    for (const listener of listeners) {
      const keepAlive = listener(message, {}, (response) => {
        if (answered) return;
        answered = true;
        resolve(response);
      });
      if (keepAlive) handled = true;
    }
    if (!handled && !answered) resolve(undefined);
  });
}

afterEach(() => {
  listeners.clear();
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

describe("dashboard messaging", () => {
  it("validates the background response", async () => {
    installChrome(async () => ({ ok: true, data: { tabId: 7 } }));
    await expect(sendToBackground({ type: "bg:openDashboard" })).resolves.toEqual({ tabId: 7 });
  });

  it("reports a transport code when the runtime cannot deliver the message", async () => {
    installChrome(async () => {
      throw new Error("extension runtime unavailable");
    });
    const failure = await sendToBackground({ type: "bg:openDashboard" }).catch(
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(MessagingError);
    expect(isTransportFailure(failure)).toBe(true);
  });

  it("answers registered messages and ignores undeclared types", async () => {
    installChrome(async () => undefined);
    const stop = onMessage({
      "bg:openDashboard": async () => ({ tabId: 7 }),
    });

    expect(await deliver({ type: "bg:openDashboard" })).toEqual({
      ok: true,
      data: { tabId: 7 },
    });
    expect(await deliver({ type: "ww:submit" })).toBeUndefined();
    stop();
    expect(await deliver({ type: "bg:openDashboard" })).toBeUndefined();
  });

  it("rejects malformed requests with a validation error", async () => {
    installChrome(async () => undefined);
    onMessage({ "bg:openDashboard": async () => ({ tabId: 7 }) });

    const envelope = await deliver({ type: "bg:openDashboard", unexpected: true });
    expect(envelope?.ok).toBe(false);
    expect(envelope && !envelope.ok ? envelope.error.code : undefined).toBe("validation");
  });
});
