import { afterEach, describe, expect, it } from "vitest";
import {
  WaitTimeoutError,
  waitFor,
  waitForElement,
  waitForRemoval,
  watchNavigation,
} from "@/lib/waterlooworks/observer";
import { fixtureHtml, parseHtml } from "./fixtures/waterlooworks/load";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("waitFor", () => {
  it("resolves immediately when the condition already holds", async () => {
    await expect(waitFor(() => "ready", { timeout: 200 })).resolves.toBe("ready");
  });

  it("resolves once the DOM changes", async () => {
    setTimeout(() => {
      const marker = document.createElement("div");
      marker.id = "late-marker";
      document.body.append(marker);
    }, 20);

    const found = await waitFor(() => document.querySelector("#late-marker") ?? undefined, {
      timeout: 2000,
      interval: 10,
    });
    expect(found).toBeTruthy();
  });

  it("rejects with a labelled WaitTimeoutError", async () => {
    const failure = await waitFor(() => undefined, {
      timeout: 60,
      interval: 10,
      label: "the results table",
    }).catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(WaitTimeoutError);
    expect((failure as WaitTimeoutError).label).toBe("the results table");
    expect((failure as Error).message).toContain("the results table");
  });

  it("propagates an error thrown by the predicate", async () => {
    await expect(
      waitFor(
        () => {
          throw new Error("predicate exploded");
        },
        { timeout: 200 },
      ),
    ).rejects.toThrow("predicate exploded");
  });
});

describe("waitForElement", () => {
  it("waits for a selector key to appear", async () => {
    setTimeout(() => {
      document.body.innerHTML = parseHtml(fixtureHtml("results-page-1")).body.innerHTML;
    }, 20);

    const table = await waitForElement("resultsTable", { timeout: 2000, interval: 10 });
    expect(table.id).toBe("postingsTable");
  });
});

describe("waitForRemoval", () => {
  it("resolves when the element leaves the document", async () => {
    const doomed = document.createElement("div");
    document.body.append(doomed);
    setTimeout(() => {
      doomed.remove();
    }, 20);
    await expect(waitForRemoval(doomed, { timeout: 2000, interval: 10 })).resolves.toBe(true);
  });
});

describe("watchNavigation", () => {
  it("fires a debounced callback on DOM changes and stops when disposed", async () => {
    let calls = 0;
    const stop = watchNavigation(
      () => {
        calls += 1;
      },
      { debounceMs: 10, pollMs: 10 },
    );

    document.body.append(document.createElement("section"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toBeGreaterThan(0);

    stop();
    const afterStop = calls;
    document.body.append(document.createElement("section"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toBe(afterStop);
  });

  it("still fires when the page never stops mutating", async () => {
    let calls = 0;
    const stop = watchNavigation(
      () => {
        calls += 1;
      },
      { debounceMs: 50, pollMs: 1000, maxDelayMs: 60 },
    );
    const churn = setInterval(() => {
      document.body.append(document.createElement("span"));
    }, 5);

    await new Promise((resolve) => setTimeout(resolve, 200));
    clearInterval(churn);
    stop();

    expect(calls).toBeGreaterThan(0);
  });
});
