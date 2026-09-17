import { describe, expect, it } from "vitest";
import { getCurrentJobId, getPageKind } from "@/lib/waterlooworks/pageKind";
import { parseFixture, parseHtml } from "./fixtures/waterlooworks/load";

describe("getPageKind", () => {
  it("recognizes the search results page", () => {
    expect(getPageKind(parseFixture("results-page-1")).kind).toBe("results");
    expect(getPageKind(parseFixture("results-page-2")).kind).toBe("results");
    expect(getPageKind(parseFixture("results-real-page-1")).kind).toBe("results");
  });

  it("recognizes a completed search with zero results", () => {
    expect(
      getPageKind(
        parseHtml(
          '<table class="data-viewer-table"><thead><tr><th>Job Title</th></tr></thead><tbody></tbody></table>',
        ),
      ).kind,
    ).toBe("results");
  });

  it("does not mistake hidden search configuration labels for an open posting", () => {
    const overview = parseHtml(
      `<main><button>All Jobs</button><h2>Keyword</h2><div style="display:none"><span class="font--bold">Job Title</span><span class="font--bold">Organization</span></div></main>`,
    );
    expect(getPageKind(overview).kind).toBe("other");
  });

  it("recognizes a posting and its id", () => {
    const full = getPageKind(parseFixture("posting-full"));
    expect(full.kind).toBe("posting");
    expect(full.jobId).toBe("384922");

    const sparse = getPageKind(parseFixture("posting-missing-sections"));
    expect(sparse.kind).toBe("posting");
    expect(sparse.jobId).toBe("385044");
  });

  it("recognizes the posting overlay on top of the results table", () => {
    const open = parseFixture("posting-overlay");
    expect(getPageKind(open)).toMatchObject({ kind: "posting", jobId: "486053" });

    open.querySelector("div.modal")?.classList.remove("is--visible");
    const inner = open.querySelector(".modal__inner--document-overlay");
    if (inner) inner.innerHTML = "";
    expect(getPageKind(open).kind).toBe("results");
  });

  it("recognizes the apply flow including the confirmation state", () => {
    expect(getPageKind(parseFixture("apply-with-packages")).kind).toBe("apply");
    expect(getPageKind(parseFixture("apply-no-questions")).kind).toBe("apply");
    expect(getPageKind(parseFixture("apply-confirmation")).kind).toBe("apply");
  });

  it("recognizes the login page", () => {
    expect(getPageKind(parseFixture("login")).kind).toBe("login");
  });

  it("fails loudly with a reason instead of guessing", () => {
    const result = getPageKind(parseHtml("<html><body><p>Session timed out.</p></body></html>"));
    expect(result.kind).toBe("other");
    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain("results table found: no");
  });
});

describe("getCurrentJobId", () => {
  it("reads the id from a data attribute", () => {
    expect(getCurrentJobId(parseFixture("posting-full"))).toBe("384922");
  });

  it("reads the id from a Job ID label when no attribute is present", () => {
    expect(getCurrentJobId(parseFixture("posting-missing-sections"))).toBe("385044");
  });

  it("reads the id from a hidden input on the apply page", () => {
    expect(getCurrentJobId(parseFixture("apply-with-packages"))).toBe("384922");
  });
});
