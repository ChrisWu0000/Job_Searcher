import { afterEach, describe, expect, it } from "vitest";
import {
  isTransportFailure,
  MessagingError,
  onMessage,
  sendToBackground,
  sendToContent,
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

describe("send helpers", () => {
  it("infers the message type from the literal and parses the matching response", async () => {
    installChrome(async () => ({ ok: true, data: { opened: true } }));
    const response = await sendToContent({ type: "ww:openJob", jobId: "384922" });
    expect(response.opened).toBe(true);
  });

  it("infers background responses without an explicit type argument", async () => {
    installChrome(async () => ({ ok: true, data: { tabId: 7, created: false } }));
    const response = await sendToBackground({ type: "bg:focusWwTab" });
    expect(response.tabId).toBe(7);
  });

  it("reports a transport code when the runtime cannot deliver the message", async () => {
    installChrome(async () => {
      throw new Error("Could not establish connection. Receiving end does not exist.");
    });
    const failure = await sendToContent({ type: "ww:getPageKind" }).catch(
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(MessagingError);
    expect(isTransportFailure(failure)).toBe(true);
  });

  it("reports a transport code when nothing answers", async () => {
    installChrome(async () => undefined);
    const failure = await sendToContent({ type: "ww:getPageKind" }).catch(
      (cause: unknown) => cause,
    );
    expect(isTransportFailure(failure)).toBe(true);
  });

  it("keeps the handler code from a failure envelope", async () => {
    installChrome(async () => ({
      ok: false,
      error: { step: "ww:submit", message: "no submit button", code: "handler" },
    }));
    const failure = await sendToContent({ type: "ww:submit" }).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(MessagingError);
    expect(isTransportFailure(failure)).toBe(false);
    expect(failure instanceof MessagingError ? failure.code : undefined).toBe("handler");
  });

  it("reports a validation code when the response does not match the schema", async () => {
    installChrome(async () => ({ ok: true, data: { hadNextPage: "yes" } }));
    const failure = await sendToContent({ type: "ww:nextResultsPage" }).catch(
      (cause: unknown) => cause,
    );
    expect(failure instanceof MessagingError ? failure.code : undefined).toBe("validation");
  });
});

describe("onMessage", () => {
  it("answers with a success envelope and ignores unregistered types", async () => {
    installChrome(async () => undefined);
    const stop = onMessage({ "ww:getPageKind": async () => ({ kind: "posting" }) });

    expect(await deliver({ type: "ww:getPageKind" })).toEqual({
      ok: true,
      data: { kind: "posting" },
    });
    expect(await deliver({ type: "ww:submit" })).toBeUndefined();
    stop();
    expect(await deliver({ type: "ww:getPageKind" })).toBeUndefined();
  });

  it("rejects a malformed request with a validation error", async () => {
    installChrome(async () => undefined);
    onMessage({ "ww:openJob": async () => ({ opened: true }) });

    const envelope = await deliver({ type: "ww:openJob" });
    expect(envelope?.ok).toBe(false);
    expect(envelope && !envelope.ok ? envelope.error.code : undefined).toBe("validation");
  });

  it("passes a transport code through from a rethrown messaging error", async () => {
    installChrome(async () => undefined);
    onMessage({
      "ww:scrapeCurrentJob": async () => {
        throw new MessagingError(
          { step: "ww:scrapeCurrentJob", message: "tab closed", code: "transport" },
          "transport",
        );
      },
    });

    const envelope = await deliver({ type: "ww:scrapeCurrentJob" });
    expect(envelope && !envelope.ok ? envelope.error.code : undefined).toBe("transport");
  });
});
