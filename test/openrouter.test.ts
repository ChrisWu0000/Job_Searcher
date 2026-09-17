import { afterEach, describe, expect, it } from "vitest";
import {
  appTitle,
  chatCompletion,
  chatCompletionsUrl,
  clearPricingCache,
  type FetchLike,
  fetchModelPricing,
  getCachedPricing,
  modelsUrl,
  OpenRouterError,
  parseRetryAfter,
  setFetch,
  testConnection,
} from "@/lib/ai/openrouter";
import { scoringVerdictJsonSchema, scoringVerdictSchemaName } from "@/lib/ai/schemas";
import goodResponse from "./fixtures/ai/good-response.json";
import modelsPayload from "./fixtures/ai/models.json";
import rateLimited from "./fixtures/ai/rate-limited.json";
import unauthorized from "./fixtures/ai/unauthorized.json";

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function stubFetch(responses: (() => Response)[]): { calls: RecordedCall[]; impl: FetchLike } {
  const calls: RecordedCall[] = [];
  let index = 0;
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!next) throw new Error("no stubbed response");
    return next();
  };
  return { calls, impl };
}

function requestBodyOf(call: RecordedCall | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init.body ?? "{}"));
}

afterEach(async () => {
  setFetch(undefined);
  await clearPricingCache();
});

describe("chatCompletion request shape", () => {
  it("sends bearer auth, attribution headers, strict json schema, reasoning and usage", async () => {
    const { calls, impl } = stubFetch([() => jsonResponse(goodResponse)]);

    const result = await chatCompletion({
      apiKey: "sk-or-secret",
      model: "z-ai/glm-5.3-flash",
      messages: [
        { role: "system", content: "system text" },
        { role: "user", content: "user text" },
      ],
      jsonSchema: { name: scoringVerdictSchemaName, schema: scoringVerdictJsonSchema },
      reasoningEffort: "medium",
      fetchImpl: impl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(chatCompletionsUrl);
    expect(calls[0]?.init.method).toBe("POST");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-secret");
    expect(headers["X-Title"]).toBe(appTitle);
    expect(headers["HTTP-Referer"]).toMatch(/^https?:\/\//);

    const body = requestBodyOf(calls[0]);
    expect(body.model).toBe("z-ai/glm-5.3-flash");
    expect(body.usage).toEqual({ include: true });
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: scoringVerdictSchemaName,
        strict: true,
        schema: scoringVerdictJsonSchema,
      },
    });

    expect(result.usage).toEqual({
      promptTokens: 2450,
      completionTokens: 260,
      costUsd: 0.00025375,
    });
    expect(result.content).toContain('"verdict":"apply"');
    expect(result.requestBody).toEqual(body);
    expect(result.raw).toEqual(goodResponse);
  });

  it("uses the module level fetch override when no implementation is passed", async () => {
    const { calls, impl } = stubFetch([() => jsonResponse(goodResponse)]);
    setFetch(impl);
    await chatCompletion({
      apiKey: "sk-or-secret",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(calls).toHaveLength(1);
  });
});

describe("retries", () => {
  it("retries a 429 and succeeds", async () => {
    const { calls, impl } = stubFetch([
      () => jsonResponse(rateLimited, 429, { "Retry-After": "0" }),
      () => jsonResponse(goodResponse),
    ]);

    const result = await chatCompletion({
      apiKey: "sk",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      retryBaseDelayMs: 1,
      fetchImpl: impl,
    });

    expect(calls).toHaveLength(2);
    expect(result.usage.promptTokens).toBe(2450);
  });

  it("retries network failures and gives up after four attempts", async () => {
    const calls: string[] = [];
    const impl: FetchLike = async () => {
      calls.push("attempt");
      throw new TypeError("Failed to fetch");
    };

    await expect(
      chatCompletion({
        apiKey: "sk",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        retryBaseDelayMs: 1,
        fetchImpl: impl,
      }),
    ).rejects.toBeInstanceOf(OpenRouterError);
    expect(calls).toHaveLength(4);
  });

  it("does not retry a 401 and reports the status and body", async () => {
    const { calls, impl } = stubFetch([() => jsonResponse(unauthorized, 401)]);

    const error = await chatCompletion({
      apiKey: "bad",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      retryBaseDelayMs: 1,
      fetchImpl: impl,
    }).catch((cause: unknown) => cause);

    expect(calls).toHaveLength(1);
    expect(error).toBeInstanceOf(OpenRouterError);
    const openRouterError = error as OpenRouterError;
    expect(openRouterError.status).toBe(401);
    expect(openRouterError.retryable).toBe(false);
    expect(openRouterError.message).toContain("No auth credentials found");
  });

  it("aborts on the per call timeout", async () => {
    const impl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });

    await expect(
      chatCompletion({
        apiKey: "sk",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5,
        maxAttempts: 1,
        fetchImpl: impl,
      }),
    ).rejects.toThrow(/timed out/);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const impl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const pending = chatCompletion({
      apiKey: "sk",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      maxAttempts: 2,
      retryBaseDelayMs: 1,
      signal: controller.signal,
      fetchImpl: impl,
    });
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/i);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and http dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("not-a-date")).toBeUndefined();
    const future = new Date(Date.now() + 5000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThan(1000);
  });
});

describe("testConnection", () => {
  it("reports success with a latency", async () => {
    const { calls, impl } = stubFetch([() => jsonResponse(goodResponse)]);
    const result = await testConnection({
      apiKey: "sk",
      model: "z-ai/glm-5.3-flash",
      fetchImpl: impl,
    });
    expect(result.ok).toBe(true);
    expect(result.modelId).toBe("z-ai/glm-5.3-flash");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(requestBodyOf(calls[0]).max_tokens).toBe(64);
  });

  it("treats a reply with no content as connected", async () => {
    const { impl } = stubFetch([
      () =>
        jsonResponse({
          choices: [{ message: { content: null }, finish_reason: "length" }],
          usage: { prompt_tokens: 12, completion_tokens: 64 },
        }),
    ]);
    const result = await testConnection({ apiKey: "sk", model: "m", fetchImpl: impl });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("an empty message");
  });

  it("explains a rejected key", async () => {
    const { impl } = stubFetch([() => jsonResponse(unauthorized, 401)]);
    const result = await testConnection({ apiKey: "bad", model: "m", fetchImpl: impl });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("401");
  });

  it("explains a missing model", async () => {
    const { impl } = stubFetch([
      () => jsonResponse({ error: { code: 404, message: "not a valid model id" } }, 404),
    ]);
    const result = await testConnection({ apiKey: "sk", model: "ghost/model", fetchImpl: impl });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("ghost/model");
  });
});

describe("model pricing", () => {
  it("converts per token prices to per million and caches them", async () => {
    const { calls, impl } = stubFetch([() => jsonResponse(modelsPayload)]);

    const pricing = await fetchModelPricing("sk", "z-ai/glm-5.3-flash", { fetchImpl: impl });

    expect(calls[0]?.url).toBe(modelsUrl);
    expect(pricing?.promptUsdPerMillion).toBeCloseTo(0.075, 6);
    expect(pricing?.completionUsdPerMillion).toBeCloseTo(0.25, 6);
    expect(pricing?.contextLength).toBe(1_300_000);

    const cached = await getCachedPricing("z-ai/glm-5.3-flash");
    expect(cached?.promptUsdPerMillion).toBeCloseTo(0.075, 6);

    await clearPricingCache();
    expect(await getCachedPricing("z-ai/glm-5.3-flash")).toBeUndefined();
  });

  it("returns undefined for a model the catalogue does not list", async () => {
    const { impl } = stubFetch([() => jsonResponse(modelsPayload)]);
    expect(await fetchModelPricing("sk", "nope/nope", { fetchImpl: impl })).toBeUndefined();
  });

  it("throws a typed error when the catalogue request fails", async () => {
    const { impl } = stubFetch([() => jsonResponse(unauthorized, 401)]);
    await expect(fetchModelPricing("sk", "any", { fetchImpl: impl })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });
});
