import { describe, expect, it } from "vitest";
import {
  anyRequestSchema,
  backgroundRequestSchema,
  contentRequestSchema,
  dashboardRequestSchema,
  directionOf,
  isMessageType,
  messageSchemas,
  messageTypes,
  parseRequest,
  parseResponse,
  responseEnvelopeSchema,
  safeParseResponse,
  toMessageError,
} from "@/lib/messaging/protocol";
import { jobSchema } from "@/types/schemas";

const sampleJob = {
  id: "384922",
  company: "Datadog",
  title: "Software Engineer Intern",
  location: "New York, NY",
  scrapedAt: "2026-09-06T14:02:00.000Z",
  application: {
    resume: true,
    gradeReport: false,
    coverLetter: true,
    otherDocuments: [],
    hasPrescreenQuestions: false,
  },
  rawText: "raw posting text",
  status: "new",
};

describe("protocol registry", () => {
  it("declares a request and response schema for every message type", () => {
    expect(messageTypes.length).toBeGreaterThan(0);
    for (const type of messageTypes) {
      const entry = messageSchemas[type];
      expect(entry.request).toBeDefined();
      expect(entry.response).toBeDefined();
      expect(["toContent", "toDashboard", "toBackground"]).toContain(directionOf(type));
    }
  });

  it("pins every request schema to its own type literal", () => {
    for (const type of messageTypes) {
      const parsed = messageSchemas[type].request.safeParse({ type: "ww:notARealMessage" });
      expect(parsed.success).toBe(false);
    }
  });

  it("recognizes only declared message types", () => {
    expect(isMessageType("ww:getPageKind")).toBe(true);
    expect(isMessageType("ww:teleport")).toBe(false);
    expect(isMessageType(42)).toBe(false);
  });
});

describe("request round trips", () => {
  it("parses a parameterless content request", () => {
    expect(parseRequest("ww:getPageKind", { type: "ww:getPageKind" })).toEqual({
      type: "ww:getPageKind",
    });
  });

  it("parses a parameterized content request", () => {
    expect(
      parseRequest("ww:selectDocument", {
        type: "ww:selectDocument",
        kind: "resume",
        documentId: "doc-1",
      }),
    ).toEqual({ type: "ww:selectDocument", kind: "resume", documentId: "doc-1" });
  });

  it("rejects a request missing a required field", () => {
    expect(() => parseRequest("ww:openJob", { type: "ww:openJob" })).toThrow();
  });

  it("routes requests through the direction unions", () => {
    expect(contentRequestSchema.safeParse({ type: "ww:submit" }).success).toBe(true);
    expect(contentRequestSchema.safeParse({ type: "bg:openDashboard" }).success).toBe(false);
    expect(
      dashboardRequestSchema.safeParse({ type: "ww:pageChanged", kind: "posting" }).success,
    ).toBe(true);
    expect(
      backgroundRequestSchema.safeParse({ type: "bg:setCheckpoint", key: "apply", value: 1 })
        .success,
    ).toBe(true);
    expect(anyRequestSchema.safeParse({ type: "ww:getApplyState" }).success).toBe(true);
  });
});

describe("response round trips", () => {
  it("round trips a job through the scrape response", () => {
    const parsed = parseResponse("ww:scrapeCurrentJob", { job: sampleJob });
    expect(parsed.job.id).toBe("384922");
    expect(jobSchema.parse(sampleJob)).toEqual(parsed.job);
  });

  it("round trips an apply state", () => {
    const applyState = {
      packages: [{ id: "pkg-1", name: "Default", documents: [{ kind: "resume", name: "CV" }] }],
      selectedPackageId: "pkg-1",
      documents: [
        {
          kind: "resume",
          required: true,
          options: [{ id: "doc-1", name: "CV" }],
          selectedId: "doc-1",
        },
      ],
      questions: [
        {
          id: "q1",
          text: "Are you eligible?",
          kind: "radio",
          options: ["Yes", "No"],
          required: true,
        },
      ],
      canSubmit: false,
      submitted: false,
    };
    expect(parseResponse("ww:getApplyState", { applyState }).applyState).toEqual(applyState);
  });

  it("reports a validation failure instead of throwing when asked to", () => {
    const parsed = safeParseResponse("ww:nextResultsPage", { hadNextPage: "yes" });
    expect(parsed.success).toBe(false);
  });
});

describe("response envelope", () => {
  const envelope = responseEnvelopeSchema(messageSchemas["ww:getPageKind"].response);

  it("accepts a success envelope", () => {
    expect(envelope.parse({ ok: true, data: { kind: "posting" } })).toEqual({
      ok: true,
      data: { kind: "posting" },
    });
  });

  it("accepts a failure envelope", () => {
    const failure = { ok: false, error: { step: "ww:getPageKind", message: "boom" } };
    expect(envelope.parse(failure)).toEqual(failure);
  });

  it("rejects an envelope with the wrong data shape", () => {
    expect(envelope.safeParse({ ok: true, data: { kind: "nope" } }).success).toBe(false);
  });
});

describe("toMessageError", () => {
  it("keeps the step name for thrown errors", () => {
    expect(toMessageError("ww:submit", new Error("no submit button"))).toMatchObject({
      step: "ww:submit",
      message: "no submit button",
    });
  });

  it("summarizes zod failures", () => {
    const failure = messageSchemas["ww:openJob"].request.safeParse({ type: "ww:openJob" });
    expect(failure.success).toBe(false);
    if (failure.success) return;
    expect(toMessageError("ww:openJob", failure.error).message).toBe("payload failed validation");
  });
});
