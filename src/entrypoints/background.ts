import { MessagingError, onMessage, sendToTab } from "@/lib/messaging/client";
import {
  type ContentMessageType,
  directionOf,
  isMessageType,
  type MessageType,
  type RequestFor,
  type ResponseEnvelope,
  toMessageError,
} from "@/lib/messaging/protocol";
import {
  findWaterlooWorksTab,
  focusOrCreateWaterlooWorksTab,
  isWaterlooWorksUrl,
  openOrFocusDashboardTab,
  recallWaterlooWorksTab,
  waterlooWorksOrigin,
} from "@/lib/messaging/tabs";
import { sleep } from "@/lib/time";

const checkpointPrefix = "checkpoint:";
const contentReadyTimeoutMs = 20_000;
const contentPollDelayMs = 300;
const missingReceiverPattern = /receiving end does not exist|could not establish connection/i;

async function readCheckpoint(key: string): Promise<unknown> {
  const storageKey = `${checkpointPrefix}${key}`;
  const stored = await chrome.storage.session.get(storageKey);
  return stored[storageKey];
}

async function writeCheckpoint(key: string, value: unknown): Promise<void> {
  await chrome.storage.session.set({ [`${checkpointPrefix}${key}`]: value });
}

async function removeCheckpoint(key: string): Promise<void> {
  await chrome.storage.session.remove(`${checkpointPrefix}${key}`);
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).host : "an empty page";
  } catch {
    return "an unknown page";
  }
}

async function resolveWaterlooWorksTabId(type: MessageType): Promise<number> {
  const existing = await findWaterlooWorksTab();
  if (existing?.id !== undefined) return existing.id;
  const remembered = await recallWaterlooWorksTab();
  if (remembered?.id !== undefined) {
    const url = remembered.pendingUrl ?? remembered.url;
    if (isWaterlooWorksUrl(url)) return remembered.id;
    throw new MessagingError({
      step: type,
      message: `the WaterlooWorks tab is on ${hostOf(url)}; log in there until WaterlooWorks loads, then start again`,
      code: "transport",
    });
  }
  throw new MessagingError({
    step: type,
    message: "no WaterlooWorks tab is open",
    code: "transport",
  });
}

function isFromWaterlooWorks(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.startsWith(waterlooWorksOrigin) === true;
}

function receiverIsMissing(cause: unknown): boolean {
  if (!(cause instanceof MessagingError)) return false;
  return missingReceiverPattern.test(`${cause.message} ${String(cause.details ?? "")}`);
}

async function waitForTabToLoad(tabId: number, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== "loading") return;
    await sleep(contentPollDelayMs);
  }
}

async function deliverToContent(tabId: number, message: unknown): Promise<unknown> {
  const deadline = Date.now() + contentReadyTimeoutMs;
  await waitForTabToLoad(tabId, deadline);
  while (true) {
    try {
      return await sendToTab(tabId, message as RequestFor<ContentMessageType>);
    } catch (cause) {
      if (!receiverIsMissing(cause) || Date.now() >= deadline) throw cause;
      await sleep(contentPollDelayMs);
    }
  }
}

async function forwardToContent(
  type: MessageType,
  message: unknown,
): Promise<ResponseEnvelope<unknown>> {
  try {
    const tabId = await resolveWaterlooWorksTabId(type);
    const data = await deliverToContent(tabId, message);
    return { ok: true, data };
  } catch (cause) {
    if (cause instanceof MessagingError) return { ok: false, error: cause.toMessageError() };
    return { ok: false, error: toMessageError(type, cause, "transport") };
  }
}

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => {
    void openOrFocusDashboardTab().catch(() => undefined);
  });

  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: ResponseEnvelope<unknown>) => void,
    ): boolean | undefined => {
      if (typeof message !== "object" || message === null) return undefined;
      const type = (message as { type?: unknown }).type;
      if (!isMessageType(type)) return undefined;

      const direction = directionOf(type);
      if (direction === "toContent" && !isFromWaterlooWorks(sender)) {
        void forwardToContent(type, message).then(sendResponse);
        return true;
      }
      return undefined;
    },
  );

  onMessage({
    "bg:openDashboard": async () => {
      const tabId = await openOrFocusDashboardTab();
      return tabId === undefined ? {} : { tabId };
    },
    "bg:focusWwTab": async (request) => focusOrCreateWaterlooWorksTab(request.url),
    "bg:getCheckpoint": async (request) => ({ value: await readCheckpoint(request.key) }),
    "bg:setCheckpoint": async (request) => {
      await writeCheckpoint(request.key, request.value);
      return { saved: true };
    },
    "bg:clearCheckpoint": async (request) => {
      await removeCheckpoint(request.key);
      return { cleared: true };
    },
  });
});
