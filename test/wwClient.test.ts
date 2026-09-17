import { afterEach, describe, expect, it, vi } from "vitest";
import { createWwClient, traceWwClient } from "@/engines/wwClient";
import type { LogLevel } from "@/types/run";
import { createFakeWw, makeStub } from "./helpers/fakeWw";

afterEach(() => vi.unstubAllGlobals());

describe("WaterlooWorks navigation across page loads", () => {
  it("continues through menu pages and a closed message channel until results really appear", async () => {
    let page = 0;
    const messages: string[] = [];
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: async (message: { type: string }) => {
          messages.push(message.type);
          if (message.type === "ww:getPageKind")
            return { ok: true, data: { kind: page >= 3 ? "results" : "other" } };
          if (message.type === "ww:navigateToResults") {
            page += 1;
            if (page === 2)
              throw new Error("The message port closed before a response was received");
            return { ok: true, data: { navigated: true } };
          }
          throw new Error(`Unexpected message ${message.type}`);
        },
      },
    });
    await expect(createWwClient().navigateToResults()).resolves.toBe(true);
    expect(page).toBe(3);
    expect(messages.filter((type) => type === "ww:navigateToResults")).toHaveLength(3);
  });

  it("gets from the overview to results before opening the requested saved job", async () => {
    let kind = "other";
    const messages: string[] = [];
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: async (message: { type: string; jobId?: string }) => {
          messages.push(message.type);
          if (message.type === "ww:getPageKind") return { ok: true, data: { kind } };
          if (message.type === "ww:navigateToResults") {
            kind = "results";
            return { ok: true, data: { navigated: true } };
          }
          if (message.type === "ww:openJob") {
            expect(kind).toBe("results");
            expect(message.jobId).toBe("485969");
            return { ok: true, data: { opened: true } };
          }
          throw new Error(`Unexpected message ${message.type}`);
        },
      },
    });
    await expect(createWwClient().openJob("485969")).resolves.toBe(true);
    expect(messages.indexOf("ww:navigateToResults")).toBeLessThan(messages.indexOf("ww:openJob"));
  });

  it("does not claim success or navigate away when login is required", async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, data: { kind: "login" } }));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    await expect(createWwClient().navigateToResults()).rejects.toThrow(/Log in to WaterlooWorks/);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

function collectingLog() {
  const lines: { level: LogLevel; message: string }[] = [];
  return { lines, log: (level: LogLevel, message: string) => lines.push({ level, message }) };
}

describe("traceWwClient", () => {
  it("logs each call with its outcome and timing", async () => {
    const fake = createFakeWw({ resultPages: [[makeStub("1"), makeStub("2")]] });
    const { lines, log } = collectingLog();
    const client = traceWwClient(fake, log);

    await client.ensureTab();
    const page = await client.getPageKind();
    const results = await client.scrapeResultsPage();

    expect(page.kind).toBe("results");
    expect(results.stubs).toHaveLength(2);
    expect(lines.map((line) => line.message)).toEqual([
      "→ ensureTab",
      expect.stringMatching(/^← ensureTab: tab 7 in \d+ ms$/),
      "→ getPageKind",
      expect.stringMatching(/^← getPageKind: results in \d+ ms$/),
      "→ scrapeResultsPage",
      expect.stringMatching(/^← scrapeResultsPage: 2 rows in \d+ ms$/),
    ]);
    expect(lines.every((line) => line.level === "debug")).toBe(true);
  });

  it("logs a failure as a warning and rethrows it", async () => {
    const fake = createFakeWw({ tabClosedOnCall: ["openJob"] });
    const { lines, log } = collectingLog();
    const client = traceWwClient(fake, log);

    await expect(client.openJob("42")).rejects.toThrow(/Receiving end does not exist/);
    expect(lines.at(-1)).toMatchObject({ level: "warn" });
    expect(lines.at(-1)?.message).toMatch(/^✗ openJob\("42"\) failed after \d+ ms: /);
  });

  it("passes checkpoints straight through", async () => {
    const fake = createFakeWw();
    const { lines, log } = collectingLog();
    const client = traceWwClient(fake, log);

    await client.setCheckpoint("k", { a: 1 });
    expect(await client.getCheckpoint("k")).toEqual({ a: 1 });
    expect(lines).toHaveLength(0);
  });
});
