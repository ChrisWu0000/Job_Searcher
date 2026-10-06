import { z } from "zod";

export const messageErrorCodeSchema = z.enum(["transport", "handler", "validation"]);
export type MessageErrorCode = z.infer<typeof messageErrorCodeSchema>;

export const messageErrorSchema = z.object({
  step: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  code: messageErrorCodeSchema.optional(),
});
export type MessageError = z.infer<typeof messageErrorSchema>;

export const messageSchemas = {
  "bg:openDashboard": {
    request: z.object({ type: z.literal("bg:openDashboard") }).strict(),
    response: z.object({ tabId: z.number().int().optional() }),
  },
} as const;

export type MessageType = keyof typeof messageSchemas;
export type RequestFor<TType extends MessageType> = z.infer<
  (typeof messageSchemas)[TType]["request"]
>;
export type ResponseFor<TType extends MessageType> = z.infer<
  (typeof messageSchemas)[TType]["response"]
>;
export type BackgroundMessageType = MessageType;
export type ResponseEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: MessageError };

export const messageTypes = Object.keys(messageSchemas) as MessageType[];

export function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && Object.hasOwn(messageSchemas, value);
}

export function safeParseRequest<TType extends MessageType>(
  type: TType,
  payload: unknown,
): z.ZodSafeParseResult<RequestFor<TType>> {
  return messageSchemas[type].request.safeParse(payload) as z.ZodSafeParseResult<RequestFor<TType>>;
}

export function safeParseResponse<TType extends MessageType>(
  type: TType,
  payload: unknown,
): z.ZodSafeParseResult<ResponseFor<TType>> {
  return messageSchemas[type].response.safeParse(payload) as z.ZodSafeParseResult<
    ResponseFor<TType>
  >;
}

export function toMessageError(
  step: string,
  cause: unknown,
  code?: MessageErrorCode,
): MessageError {
  if (cause instanceof z.ZodError) {
    return {
      step,
      message: "payload failed validation",
      details: cause.issues,
      code: code ?? "validation",
    };
  }
  if (cause instanceof Error) {
    return { step, message: cause.message, details: cause.stack, code: code ?? "handler" };
  }
  return { step, message: String(cause), code: code ?? "handler" };
}
