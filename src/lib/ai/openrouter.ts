import { z } from "zod";
import type { ReasoningEffort } from "@/types/preferences";
import type { ConnectionTestResult, ModelPricing, OpenRouterUsage } from "./contracts";

export const openRouterBaseUrl = "https://openrouter.ai/api/v1";
export const chatCompletionsUrl = `${openRouterBaseUrl}/chat/completions`;
export const modelsUrl = `${openRouterBaseUrl}/models`;
export const appRefererUrl = "https://github.com/ChrisWu0000/WW_agent";
export const appTitle = "JobScope";
export const pricingStorageKey = "openrouter:pricing";
export const pricingMaxAgeMs = 24 * 60 * 60 * 1000;

const defaultMaxAttempts = 4;
const connectionTestMaxTokens = 64;
const defaultTimeoutMs = 60_000;
const defaultRetryBaseDelayMs = 500;
const maxRetryDelayMs = 20_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

let fetchOverride: FetchLike | undefined;

export function setFetch(next: FetchLike | undefined): void {
  fetchOverride = next;
}

function activeFetch(explicit?: FetchLike): FetchLike {
  if (explicit) return explicit;
  if (fetchOverride) return fetchOverride;
  return (url, init) => fetch(url, init);
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatCompletionRequest {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  jsonSchema?: JsonSchemaFormat;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  allowEmptyContent?: boolean;
  temperature?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

export interface ChatCompletionResult {
  content: string;
  usage: OpenRouterUsage;
  raw: unknown;
  requestBody: unknown;
}

export class OpenRouterError extends Error {
  readonly status: number | undefined;
  readonly body: unknown;
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(
    message: string,
    options: { status?: number; body?: unknown; retryable?: boolean; attempts?: number } = {},
  ) {
    super(message);
    this.name = "OpenRouterError";
    this.status = options.status;
    this.body = options.body;
    this.retryable = options.retryable ?? false;
    this.attempts = options.attempts ?? 1;
  }
}

const usagePayloadSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  cost: z.number().optional(),
});

const chatCompletionPayloadSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
  usage: usagePayloadSchema.optional(),
  error: z
    .object({
      message: z.string().optional(),
      code: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
});

const modelPricingPayloadSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      context_length: z.number().nullable().optional(),
      pricing: z
        .object({
          prompt: z.union([z.string(), z.number()]).optional(),
          completion: z.union([z.string(), z.number()]).optional(),
        })
        .optional(),
    }),
  ),
});

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": appRefererUrl,
    "X-Title": appTitle,
  };
}

export function buildChatCompletionBody(request: ChatCompletionRequest): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages,
    ...(request.jsonSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.jsonSchema.name,
              strict: true,
              schema: request.jsonSchema.schema,
            },
          },
        }
      : {}),
    ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    usage: { include: true },
  };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OpenRouterError("Request aborted.", { retryable: false }));
      return;
    }
    const handle = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(handle);
      reject(new OpenRouterError("Request aborted.", { retryable: false }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const target = Date.parse(header);
  if (Number.isNaN(target)) return undefined;
  return Math.max(0, target - Date.now());
}

export function backoffDelayMs(attempt: number, baseDelayMs: number, jitter: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  return Math.min(maxRetryDelayMs, Math.round(exponential + jitter * baseDelayMs));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeBody(body: unknown): string {
  if (typeof body === "string") return body;
  const parsed = chatCompletionPayloadSchema.safeParse(body);
  const message = parsed.success ? parsed.data.error?.message : undefined;
  return message ?? JSON.stringify(body ?? null);
}

interface AttemptOutcome {
  result?: ChatCompletionResult;
  error?: OpenRouterError;
  retryAfterMs?: number;
}

async function requestOnce(
  request: ChatCompletionRequest,
  body: Record<string, unknown>,
  attempt: number,
): Promise<AttemptOutcome> {
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  request.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await activeFetch(request.fetchImpl)(chatCompletionsUrl, {
      method: "POST",
      headers: authHeaders(request.apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await readBody(response);
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      return {
        error: new OpenRouterError(
          `OpenRouter request failed with ${response.status}: ${describeBody(errorBody)}`,
          {
            status: response.status,
            body: errorBody,
            retryable: isRetryableStatus(response.status),
            attempts: attempt,
          },
        ),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }

    const payload = await readBody(response);
    const parsed = chatCompletionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        error: new OpenRouterError("OpenRouter returned an unrecognized response shape.", {
          status: response.status,
          body: payload,
          attempts: attempt,
        }),
      };
    }
    if (parsed.data.error?.message) {
      return {
        error: new OpenRouterError(`OpenRouter returned an error: ${parsed.data.error.message}`, {
          status: response.status,
          body: payload,
          attempts: attempt,
        }),
      };
    }
    const content =
      parsed.data.choices?.[0]?.message?.content ?? (request.allowEmptyContent ? "" : undefined);
    if (typeof content !== "string") {
      return {
        error: new OpenRouterError("OpenRouter response contained no message content.", {
          status: response.status,
          body: payload,
          attempts: attempt,
        }),
      };
    }
    return {
      result: {
        content,
        usage: {
          promptTokens: parsed.data.usage?.prompt_tokens ?? 0,
          completionTokens: parsed.data.usage?.completion_tokens ?? 0,
          costUsd: parsed.data.usage?.cost ?? 0,
        },
        raw: payload,
        requestBody: body,
      },
    };
  } catch (cause) {
    if (cause instanceof OpenRouterError) return { error: cause };
    const aborted = request.signal?.aborted === true;
    const message = cause instanceof Error ? cause.message : String(cause);
    if (timedOut) {
      return {
        error: new OpenRouterError(`OpenRouter request timed out after ${timeoutMs} ms.`, {
          retryable: true,
          attempts: attempt,
        }),
      };
    }
    if (aborted) {
      return {
        error: new OpenRouterError("OpenRouter request was aborted.", { attempts: attempt }),
      };
    }
    return {
      error: new OpenRouterError(`OpenRouter request failed: ${message}`, {
        retryable: true,
        attempts: attempt,
      }),
    };
  } finally {
    clearTimeout(timeoutHandle);
    request.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function chatCompletion(
  request: ChatCompletionRequest,
): Promise<ChatCompletionResult> {
  const body = buildChatCompletionBody(request);
  const maxAttempts = Math.max(1, request.maxAttempts ?? defaultMaxAttempts);
  const baseDelayMs = request.retryBaseDelayMs ?? defaultRetryBaseDelayMs;
  let lastError: OpenRouterError = new OpenRouterError("OpenRouter request was never attempted.");

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = await requestOnce(request, body, attempt);
    if (outcome.result) return outcome.result;
    lastError = outcome.error ?? lastError;
    if (!lastError.retryable || attempt === maxAttempts) break;
    const waitMs = outcome.retryAfterMs ?? backoffDelayMs(attempt, baseDelayMs, Math.random());
    await delay(waitMs, request.signal);
  }

  throw lastError;
}

export interface ConnectionTestOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

function describeConnectionFailure(error: unknown, modelId: string): string {
  if (!(error instanceof OpenRouterError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const detail = describeBody(error.body);
  if (error.status === 401) return "The OpenRouter API key was rejected (401).";
  if (error.status === 402) return "The OpenRouter account has no credit left (402).";
  if (error.status === 404) return `Model "${modelId}" was not found on OpenRouter (404).`;
  if (error.status === 429) return "OpenRouter rate limited the test request (429).";
  if (/not a valid model|no endpoints found|unknown model/i.test(detail)) {
    return `Model "${modelId}" was not found on OpenRouter.`;
  }
  return error.message;
}

export async function testConnection(
  options: ConnectionTestOptions,
): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  try {
    const result = await chatCompletion({
      apiKey: options.apiKey,
      model: options.model,
      messages: [{ role: "user", content: "Reply with the single word ok." }],
      maxTokens: connectionTestMaxTokens,
      allowEmptyContent: true,
      maxAttempts: 1,
      timeoutMs: options.timeoutMs ?? 20_000,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    return {
      ok: true,
      message: `Connected to ${options.model}. Replied with ${result.content.trim().slice(0, 40) || "an empty message"}.`,
      latencyMs: Date.now() - startedAt,
      modelId: options.model,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeConnectionFailure(error, options.model),
      latencyMs: Date.now() - startedAt,
      modelId: options.model,
    };
  }
}

const pricingMemoryCache = new Map<string, ModelPricing>();

function localStorageArea() {
  if (typeof chrome === "undefined") return undefined;
  return chrome.storage?.local;
}

async function readStoredPricing(): Promise<Record<string, ModelPricing>> {
  const area = localStorageArea();
  if (!area) return {};
  const stored = await area.get(pricingStorageKey);
  const value = stored[pricingStorageKey];
  if (value === null || typeof value !== "object") return {};
  return value as Record<string, ModelPricing>;
}

async function writeStoredPricing(pricing: ModelPricing): Promise<void> {
  const area = localStorageArea();
  if (!area) return;
  const existing = await readStoredPricing();
  await area.set({ [pricingStorageKey]: { ...existing, [pricing.modelId]: pricing } });
}

export async function getCachedPricing(modelId: string): Promise<ModelPricing | undefined> {
  const inMemory = pricingMemoryCache.get(modelId);
  if (inMemory) return inMemory;
  const stored = (await readStoredPricing())[modelId];
  if (!stored) return undefined;
  pricingMemoryCache.set(modelId, stored);
  return stored;
}

export async function clearPricingCache(): Promise<void> {
  pricingMemoryCache.clear();
  const area = localStorageArea();
  if (area) await area.remove(pricingStorageKey);
}

function perMillion(value: string | number | undefined): number {
  const numeric = typeof value === "number" ? value : Number(value ?? Number.NaN);
  if (!Number.isFinite(numeric)) return 0;
  return numeric * 1_000_000;
}

export interface PricingFetchOptions {
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export async function fetchModelPricing(
  apiKey: string,
  modelId: string,
  options: PricingFetchOptions = {},
): Promise<ModelPricing | undefined> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await activeFetch(options.fetchImpl)(modelsUrl, {
      method: "GET",
      headers: authHeaders(apiKey),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await readBody(response);
      throw new OpenRouterError(
        `Could not load OpenRouter model pricing (${response.status}): ${describeBody(body)}`,
        { status: response.status, body },
      );
    }
    const parsed = modelPricingPayloadSchema.safeParse(await readBody(response));
    if (!parsed.success) return undefined;
    const entry = parsed.data.data.find((model) => model.id === modelId);
    if (!entry) return undefined;
    const pricing: ModelPricing = {
      modelId,
      promptUsdPerMillion: perMillion(entry.pricing?.prompt),
      completionUsdPerMillion: perMillion(entry.pricing?.completion),
      ...(typeof entry.context_length === "number" ? { contextLength: entry.context_length } : {}),
      fetchedAt: new Date().toISOString(),
    };
    pricingMemoryCache.set(modelId, pricing);
    await writeStoredPricing(pricing);
    return pricing;
  } finally {
    clearTimeout(timeoutHandle);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

export async function resolveModelPricing(
  apiKey: string,
  modelId: string,
  options: PricingFetchOptions = {},
): Promise<ModelPricing | undefined> {
  const cached = await getCachedPricing(modelId);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < pricingMaxAgeMs) return cached;
  try {
    return (await fetchModelPricing(apiKey, modelId, options)) ?? cached;
  } catch {
    return cached;
  }
}
