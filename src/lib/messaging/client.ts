import {
  type BackgroundMessageType,
  isMessageType,
  type MessageError,
  type MessageErrorCode,
  type MessageType,
  type RequestFor,
  type ResponseEnvelope,
  type ResponseFor,
  safeParseRequest,
  safeParseResponse,
  toMessageError,
} from "./protocol";

export class MessagingError extends Error {
  readonly step: string;
  readonly code: MessageErrorCode;
  readonly details: unknown;

  constructor(error: MessageError, fallbackCode: MessageErrorCode = "handler") {
    super(`${error.step}: ${error.message}`);
    this.name = "MessagingError";
    this.step = error.step;
    this.code = error.code ?? fallbackCode;
    this.details = error.details;
  }

  get isTransportFailure(): boolean {
    return this.code === "transport";
  }

  toMessageError(): MessageError {
    return { step: this.step, message: this.message, details: this.details, code: this.code };
  }
}

export function isTransportFailure(cause: unknown): boolean {
  return cause instanceof MessagingError && cause.isTransportFailure;
}

export function isResponseEnvelope(value: unknown): value is ResponseEnvelope<unknown> {
  return typeof value === "object" && value !== null && "ok" in value;
}

type Request<TType extends MessageType> = RequestFor<TType> & { type: TType };

function unwrap<TType extends MessageType>(type: TType, raw: unknown): ResponseFor<TType> {
  if (!isResponseEnvelope(raw)) {
    throw new MessagingError({
      step: type,
      message: "no response envelope received from the extension",
      details: raw,
      code: "transport",
    });
  }
  if (!raw.ok) throw new MessagingError(raw.error);
  const parsed = safeParseResponse(type, raw.data);
  if (!parsed.success) {
    throw new MessagingError(toMessageError(type, parsed.error, "validation"), "validation");
  }
  return parsed.data;
}

export async function sendToBackground<TType extends BackgroundMessageType>(
  message: Request<TType>,
): Promise<ResponseFor<TType>> {
  const { type } = message;
  let raw: unknown;
  try {
    raw = await chrome.runtime.sendMessage(message);
  } catch (cause) {
    throw new MessagingError(toMessageError(type, cause, "transport"), "transport");
  }
  return unwrap(type, raw);
}

export type MessageHandler<TType extends MessageType> = (
  request: RequestFor<TType>,
  sender: chrome.runtime.MessageSender,
) => Promise<ResponseFor<TType>> | ResponseFor<TType>;

export type MessageHandlers = {
  [TType in MessageType]?: MessageHandler<TType>;
};

type ErasedHandler = (
  request: unknown,
  sender: chrome.runtime.MessageSender,
) => Promise<unknown> | unknown;

export function onMessage(handlers: MessageHandlers): () => void {
  const listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ResponseEnvelope<unknown>) => void,
  ): boolean | undefined => {
    if (typeof message !== "object" || message === null) return undefined;
    const type = (message as { type?: unknown }).type;
    if (!isMessageType(type)) return undefined;
    const handler = handlers[type] as ErasedHandler | undefined;
    if (!handler) return undefined;

    const parsed = safeParseRequest(type, message);
    if (!parsed.success) {
      sendResponse({ ok: false, error: toMessageError(type, parsed.error, "validation") });
      return true;
    }

    Promise.resolve(handler(parsed.data, sender))
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((cause: unknown) => {
        sendResponse({
          ok: false,
          error:
            cause instanceof MessagingError
              ? cause.toMessageError()
              : toMessageError(type, cause, "handler"),
        });
      });
    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
