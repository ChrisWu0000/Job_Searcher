import { z } from "zod";
import {
  applyStateSchema,
  jobSchema,
  jobStubSchema,
  pageKindSchema,
  questionSchema,
  resultRowSchema,
} from "@/types/schemas";

export const messageErrorCodeSchema = z.enum(["transport", "handler", "validation"]);

export type MessageErrorCode = z.infer<typeof messageErrorCodeSchema>;

export const messageErrorSchema = z.object({
  step: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  code: messageErrorCodeSchema.optional(),
});

export type MessageError = z.infer<typeof messageErrorSchema>;

export type MessageDirection = "toContent" | "toDashboard" | "toBackground";

export const messageSchemas = {
  "ww:getPageKind": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:getPageKind") }),
    response: z.object({
      kind: pageKindSchema,
      jobId: z.string().optional(),
      reason: z.string().optional(),
      url: z.string().optional(),
    }),
  },
  "ww:navigateToResults": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:navigateToResults") }),
    response: z.object({ navigated: z.boolean() }),
  },
  "ww:applyQuickFilters": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:applyQuickFilters") }),
    response: z.object({ changed: z.boolean(), active: z.array(z.string()) }),
  },
  "ww:scrapeResultsPage": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:scrapeResultsPage") }),
    response: z.object({ stubs: z.array(jobStubSchema), pageNumber: z.number().int().optional() }),
  },
  "ww:nextResultsPage": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:nextResultsPage") }),
    response: z.object({ hadNextPage: z.boolean() }),
  },
  "ww:openJob": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:openJob"), jobId: z.string() }),
    response: z.object({ opened: z.boolean() }),
  },
  "ww:getCurrentJobId": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:getCurrentJobId") }),
    response: z.object({ jobId: z.string().optional() }),
  },
  "ww:scrapeCurrentJob": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:scrapeCurrentJob") }),
    response: z.object({ job: jobSchema }),
  },
  "ww:startApplication": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:startApplication"), jobId: z.string() }),
    response: z.object({ started: z.boolean() }),
  },
  "ww:getApplyState": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:getApplyState") }),
    response: z.object({ applyState: applyStateSchema }),
  },
  "ww:selectPackage": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:selectPackage"), packageId: z.string() }),
    response: z.object({ selected: z.boolean() }),
  },
  "ww:selectDocument": {
    direction: "toContent",
    request: z.object({
      type: z.literal("ww:selectDocument"),
      kind: z.string(),
      documentId: z.string(),
    }),
    response: z.object({ selected: z.boolean() }),
  },
  "ww:getPrescreenQuestions": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:getPrescreenQuestions") }),
    response: z.object({ questions: z.array(questionSchema) }),
  },
  "ww:submit": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:submit") }),
    response: z.object({ submitted: z.boolean(), confirmationText: z.string().optional() }),
  },
  "ww:highlight": {
    direction: "toContent",
    request: z.object({
      type: z.literal("ww:highlight"),
      selectorKey: z.string(),
      label: z.string().optional(),
      durationMs: z.number().int().positive().optional(),
    }),
    response: z.object({ highlighted: z.boolean() }),
  },
  "ww:fetchResults": {
    direction: "toContent",
    request: z.object({
      type: z.literal("ww:fetchResults"),
      page: z.number().int().positive(),
      itemsPerPage: z.number().int().positive(),
    }),
    response: z.object({
      available: z.boolean(),
      totalResults: z.number().int().nonnegative(),
      page: z.number().int().nonnegative(),
      rows: z.array(resultRowSchema),
    }),
  },
  "ww:fetchPosting": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:fetchPosting"), jobId: z.string() }),
    response: z.object({ job: jobSchema }),
  },
  "ww:captureHtml": {
    direction: "toContent",
    request: z.object({ type: z.literal("ww:captureHtml") }),
    response: z.object({
      html: z.string(),
      kind: pageKindSchema,
      url: z.string(),
      jobId: z.string().optional(),
    }),
  },
  "ww:pageChanged": {
    direction: "toDashboard",
    request: z.object({
      type: z.literal("ww:pageChanged"),
      kind: pageKindSchema,
      jobId: z.string().optional(),
      url: z.string().optional(),
    }),
    response: z.object({ acknowledged: z.boolean() }),
  },
  "ww:error": {
    direction: "toDashboard",
    request: z.object({
      type: z.literal("ww:error"),
      step: z.string(),
      message: z.string(),
      html: z.string().optional(),
    }),
    response: z.object({ acknowledged: z.boolean() }),
  },
  "bg:openDashboard": {
    direction: "toBackground",
    request: z.object({ type: z.literal("bg:openDashboard") }),
    response: z.object({ tabId: z.number().int().optional() }),
  },
  "bg:focusWwTab": {
    direction: "toBackground",
    request: z.object({ type: z.literal("bg:focusWwTab"), url: z.string().optional() }),
    response: z.object({ tabId: z.number().int(), created: z.boolean() }),
  },
  "bg:getCheckpoint": {
    direction: "toBackground",
    request: z.object({ type: z.literal("bg:getCheckpoint"), key: z.string() }),
    response: z.object({ value: z.unknown().optional() }),
  },
  "bg:setCheckpoint": {
    direction: "toBackground",
    request: z.object({
      type: z.literal("bg:setCheckpoint"),
      key: z.string(),
      value: z.unknown(),
    }),
    response: z.object({ saved: z.boolean() }),
  },
  "bg:clearCheckpoint": {
    direction: "toBackground",
    request: z.object({ type: z.literal("bg:clearCheckpoint"), key: z.string() }),
    response: z.object({ cleared: z.boolean() }),
  },
} as const satisfies Record<
  string,
  { direction: MessageDirection; request: z.ZodObject; response: z.ZodType }
>;

export type MessageSchemas = typeof messageSchemas;
export type MessageType = keyof MessageSchemas;

export type RequestFor<TType extends MessageType> = z.infer<MessageSchemas[TType]["request"]>;
export type ResponseFor<TType extends MessageType> = z.infer<MessageSchemas[TType]["response"]>;

export type MessageTypeOfDirection<TDirection extends MessageDirection> = {
  [K in MessageType]: MessageSchemas[K]["direction"] extends TDirection ? K : never;
}[MessageType];

export type ContentMessageType = MessageTypeOfDirection<"toContent">;
export type DashboardMessageType = MessageTypeOfDirection<"toDashboard">;
export type BackgroundMessageType = MessageTypeOfDirection<"toBackground">;

export const messageTypes = Object.keys(messageSchemas) as MessageType[];

export function directionOf(type: MessageType): MessageDirection {
  return messageSchemas[type].direction;
}

export function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && value in messageSchemas;
}

export const contentRequestSchema = z.discriminatedUnion("type", [
  messageSchemas["ww:getPageKind"].request,
  messageSchemas["ww:navigateToResults"].request,
  messageSchemas["ww:applyQuickFilters"].request,
  messageSchemas["ww:scrapeResultsPage"].request,
  messageSchemas["ww:nextResultsPage"].request,
  messageSchemas["ww:openJob"].request,
  messageSchemas["ww:getCurrentJobId"].request,
  messageSchemas["ww:scrapeCurrentJob"].request,
  messageSchemas["ww:startApplication"].request,
  messageSchemas["ww:getApplyState"].request,
  messageSchemas["ww:selectPackage"].request,
  messageSchemas["ww:selectDocument"].request,
  messageSchemas["ww:getPrescreenQuestions"].request,
  messageSchemas["ww:submit"].request,
  messageSchemas["ww:highlight"].request,
  messageSchemas["ww:fetchResults"].request,
  messageSchemas["ww:fetchPosting"].request,
  messageSchemas["ww:captureHtml"].request,
]);

export const dashboardRequestSchema = z.discriminatedUnion("type", [
  messageSchemas["ww:pageChanged"].request,
  messageSchemas["ww:error"].request,
]);

export const backgroundRequestSchema = z.discriminatedUnion("type", [
  messageSchemas["bg:openDashboard"].request,
  messageSchemas["bg:focusWwTab"].request,
  messageSchemas["bg:getCheckpoint"].request,
  messageSchemas["bg:setCheckpoint"].request,
  messageSchemas["bg:clearCheckpoint"].request,
]);

export const anyRequestSchema = z.union([
  contentRequestSchema,
  dashboardRequestSchema,
  backgroundRequestSchema,
]);

export type ContentRequest = z.infer<typeof contentRequestSchema>;
export type DashboardRequest = z.infer<typeof dashboardRequestSchema>;
export type BackgroundRequest = z.infer<typeof backgroundRequestSchema>;
export type AnyRequest = z.infer<typeof anyRequestSchema>;

export type ResponseEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: MessageError };

export function responseEnvelopeSchema<TSchema extends z.ZodType>(dataSchema: TSchema) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: messageErrorSchema }),
  ]);
}

export function parseRequest<TType extends MessageType>(
  type: TType,
  payload: unknown,
): RequestFor<TType> {
  return messageSchemas[type].request.parse(payload) as RequestFor<TType>;
}

export function parseResponse<TType extends MessageType>(
  type: TType,
  payload: unknown,
): ResponseFor<TType> {
  return messageSchemas[type].response.parse(payload) as ResponseFor<TType>;
}

export function safeParseResponse<TType extends MessageType>(
  type: TType,
  payload: unknown,
): z.ZodSafeParseResult<ResponseFor<TType>> {
  return messageSchemas[type].response.safeParse(payload) as z.ZodSafeParseResult<
    ResponseFor<TType>
  >;
}

export function safeParseRequest<TType extends MessageType>(
  type: TType,
  payload: unknown,
): z.ZodSafeParseResult<RequestFor<TType>> {
  return messageSchemas[type].request.safeParse(payload) as z.ZodSafeParseResult<RequestFor<TType>>;
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
