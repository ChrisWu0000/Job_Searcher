import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyQuickFilters,
  findClickableByText,
  hasNextResultsPage,
  navigateToResults,
  nextResultsPage,
  openJob,
} from "@/lib/waterlooworks/navigator";
import { getPageKind } from "@/lib/waterlooworks/pageKind";
import { firstResultsRowId } from "@/lib/waterlooworks/scraper";
import { fixtureHtml, mountFixture, parseHtml } from "./fixtures/waterlooworks/load";

afterEach(() => vi.unstubAllGlobals());

function bodyOfFixture(name: Parameters<typeof mountFixture>[0]): string {
  return parseHtml(fixtureHtml(name)).body.innerHTML;
}

function onClick(selector: string, handler: () => void): void {
  const element = document.querySelector(selector);
  element?.addEventListener("click", (event) => {
    event.preventDefault();
    handler();
  });
}

describe("nextResultsPage", () => {
  beforeEach(() => {
    mountFixture("results-page-1");
  });

  it("resolves only after the first row id changes", async () => {
    expect(hasNextResultsPage()).toBe(true);
    onClick("li.next > a", () => {
      document.body.innerHTML = bodyOfFixture("results-page-2");
    });

    const result = await nextResultsPage({ holdMs: 0, timeout: 2000 });

    expect(result).toEqual({ hadNextPage: true });
    expect(firstResultsRowId()).toBe("385110");
  });

  it("turns on the My Program quick filter when it is off", async () => {
    mountFixture("results-real-page-1");
    await expect(applyQuickFilters({ holdMs: 0 })).resolves.toEqual({
      changed: false,
      active: ["My Program"],
    });

    const icon = document.querySelector(".js--data-grid-toggle-quick-filter .button--toggle-on");
    icon?.classList.replace("button--toggle-on", "button--toggle-off");
    if (icon) icon.textContent = "toggle_off";
    onClick(".js--data-grid-toggle-quick-filter button", () => {
      icon?.classList.replace("button--toggle-off", "button--toggle-on");
      if (icon) icon.textContent = "toggle_on";
    });

    await expect(applyQuickFilters({ holdMs: 0, timeout: 2000 })).resolves.toEqual({
      changed: true,
      active: ["My Program"],
    });
  });

  it("finds the enabled next link in the real WaterlooWorks pager", () => {
    mountFixture("results-real-page-1");
    expect(hasNextResultsPage()).toBe(true);
    const link = document.querySelector("a[aria-label='Go to next page']");
    link?.classList.add("disabled");
    expect(hasNextResultsPage()).toBe(false);
  });

  it("reports no next page when the pager next link is disabled", async () => {
    mountFixture("results-page-2");
    expect(hasNextResultsPage()).toBe(false);
    await expect(nextResultsPage({ holdMs: 0 })).resolves.toEqual({ hadNextPage: false });
  });

  it("times out with the label of the action when the page never changes", async () => {
    onClick("li.next > a", () => undefined);
    await expect(nextResultsPage({ holdMs: 0, timeout: 100, interval: 10 })).rejects.toThrow(
      /Next results page/,
    );
  });
});

describe("openJob", () => {
  beforeEach(() => {
    mountFixture("results-page-1");
  });

  it("clicks the row and resolves once that posting is showing", async () => {
    onClick("tr[data-posting-id='384922'] a", () => {
      document.body.innerHTML = bodyOfFixture("posting-full");
    });

    await expect(openJob("384922", { holdMs: 0, timeout: 2000 })).resolves.toEqual({
      opened: true,
    });
    expect(getPageKind().kind).toBe("posting");
  });

  it("refuses to guess when the job is not in the table", async () => {
    await expect(openJob("999999", { holdMs: 0 })).rejects.toThrow(/not present in the results/);
  });

  it("clears conflicting filters and searches the requested ID before opening it", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<button aria-label="Clear Filters">Clear Filters</button><input id="keywordSearch"><button aria-label="Submit Keyword">search</button>`,
    );
    const input = document.querySelector<HTMLInputElement>("#keywordSearch");
    let typed = "";
    input?.addEventListener("input", () => {
      typed = input.value;
    });
    onClick("button[aria-label='Clear Filters']", () => {
      document.querySelector("button[aria-label='Clear Filters']")?.remove();
    });
    onClick("button[aria-label='Submit Keyword']", () => {
      expect(typed).toBe("385110");
      expect(document.querySelector("button[aria-label='Clear Filters']")).toBeNull();
      document.body.innerHTML = bodyOfFixture("results-page-2");
      onClick("tr[data-posting-id='385110'] a", () => {
        document.body.innerHTML = `<main data-posting-id="385110"><h2>Job Summary</h2><p>Requested posting</p></main>`;
      });
    });
    await expect(openJob("385110", { holdMs: 0, timeout: 500 })).resolves.toEqual({ opened: true });
    expect(getPageKind()).toMatchObject({ kind: "posting", jobId: "385110" });
  });

  it("never opens another job when an ID search finds nothing", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<input id="keywordSearch"><button aria-label="Submit Keyword">search</button>`,
    );
    onClick("button[aria-label='Submit Keyword']", () => {
      document.querySelector("tbody")?.replaceChildren();
    });
    await expect(openJob("999999", { holdMs: 0, timeout: 50 })).rejects.toThrow(
      /may have closed or be unavailable/,
    );
    expect(getPageKind().kind).toBe("results");
  });
});

describe("navigateToResults", () => {
  it("uses the back link and waits for the results table", async () => {
    mountFixture("posting-full");
    onClick("a.js--back-to-search", () => {
      document.body.innerHTML = bodyOfFixture("results-page-1");
    });

    await expect(navigateToResults({ holdMs: 0, timeout: 2000 })).resolves.toEqual({
      navigated: true,
    });
    expect(getPageKind().kind).toBe("results");
  });

  it("refuses to go back from a page that is not a posting", async () => {
    mountFixture("login");
    const back = vi.spyOn(history, "back");
    const assign = vi.fn();
    await expect(navigateToResults({ holdMs: 0, timeout: 500, assign })).rejects.toThrow(
      /Log in to WaterlooWorks/,
    );
    expect(assign).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("closes the posting overlay to get back to the results underneath", async () => {
    mountFixture("posting-overlay");
    expect(getPageKind().kind).toBe("posting");
    onClick("nav.floating--action-bar button:last-child", () => {
      document.querySelector("div.modal")?.classList.remove("is--visible");
    });

    await expect(navigateToResults({ holdMs: 0, timeout: 2000 })).resolves.toEqual({
      navigated: true,
    });
    expect(getPageKind().kind).toBe("results");
  });

  it("closes an open overlay before opening another job from the table", async () => {
    mountFixture("posting-overlay");
    onClick("nav.floating--action-bar button:last-child", () => {
      document.querySelector("div.modal")?.classList.remove("is--visible");
    });
    onClick("#resultRow_486044 ~ label", () => undefined);
    const link = Array.from(document.querySelectorAll("table.data-viewer-table td a")).find((a) =>
      /Asset Management/.test(a.textContent ?? ""),
    );
    link?.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector("div.modal")?.classList.add("is--visible");
      const idSpan = document.querySelector(".dashboard-header--mini__content span");
      if (idSpan) idSpan.textContent = "486044";
    });

    await expect(openJob("486044", { holdMs: 0, timeout: 2000 })).resolves.toEqual({
      opened: true,
    });
    expect(getPageKind()).toMatchObject({ kind: "posting", jobId: "486044" });
  });

  it("sends any other page to the job search address", async () => {
    document.body.innerHTML = "<main><h1>Dashboard</h1></main>";
    const assign = vi.fn();

    await expect(navigateToResults({ holdMs: 0, timeout: 500, assign })).resolves.toEqual({
      navigated: true,
    });
    expect(assign).toHaveBeenCalledWith(
      "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm",
    );
  });

  it("turns on the quick filters on the job search overview to reveal the table", async () => {
    document.body.innerHTML = `
      <main>
        <ul class="quick__filters--list">
          <li><div class="data-grid-quick-filter js--data-grid-toggle-quick-filter"><button type="button">My Program <i class="material-icons button--toggle-off">toggle_off</i></button></div></li>
        </ul>
        <h2>Keyword</h2>
      </main>`;
    onClick(".js--data-grid-toggle-quick-filter button", () => {
      const icon = document.querySelector(".button--toggle-off");
      icon?.classList.replace("button--toggle-off", "button--toggle-on");
      if (icon) icon.textContent = "toggle_on";
      document.body.insertAdjacentHTML("beforeend", bodyOfFixture("results-page-1"));
    });

    await expect(navigateToResults({ holdMs: 0, timeout: 2000 })).resolves.toEqual({
      navigated: true,
    });
    expect(getPageKind().kind).toBe("results");
  });

  it("opens All Jobs from the overview even when My Program is already on", async () => {
    document.body.innerHTML = `<button>All Jobs</button><div class="js--data-grid-toggle-quick-filter"><button>My Program <i class="button--toggle-on">toggle_on</i></button></div><h2>Keyword</h2>`;
    onClick("body > button", () => {
      document.body.innerHTML = bodyOfFixture("results-page-1");
    });
    await expect(navigateToResults({ holdMs: 0, timeout: 500 })).resolves.toEqual({
      navigated: true,
    });
    expect(getPageKind().kind).toBe("results");
  });

  it("opens the real search overview without going back when hidden posting labels exist", async () => {
    vi.stubGlobal("location", { pathname: "/myAccount/co-op/full/jobs.htm" });
    document.body.innerHTML = `<button>All Jobs</button><h2>Keyword</h2><div style="display:none"><span>Job Title</span><span>Organization</span></div>`;
    const back = vi.spyOn(history, "back");
    onClick("body > button", () => {
      document.body.innerHTML = bodyOfFixture("results-page-1");
    });
    await expect(navigateToResults({ holdMs: 0, timeout: 500 })).resolves.toEqual({
      navigated: true,
    });
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("uses the actual Co-op Jobs navigation link before falling back to a URL", async () => {
    document.body.innerHTML = `<a href="/myAccount/co-op.htm">Co-op Jobs</a>`;
    const assign = vi.fn();
    onClick("a", () => {
      document.body.innerHTML = bodyOfFixture("results-page-1");
    });
    await expect(navigateToResults({ holdMs: 0, timeout: 500, assign })).resolves.toEqual({
      navigated: true,
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores duplicate controls inside hidden menus", () => {
    document.body.innerHTML = `<div style="display: none"><button>All Jobs</button></div><button id="visible">All Jobs</button>`;
    expect(findClickableByText(/^all jobs$/i)?.id).toBe("visible");
  });

  it("prefers the actual job-board link over a Full-Cycle menu link that returns to the overview", async () => {
    vi.stubGlobal("location", { pathname: "/myAccount/co-op/student.htm" });
    document.body.innerHTML = `<a id="menu" href="/myAccount/co-op/full.htm">Full-Cycle Service</a><a id="board" href="/myAccount/co-op/full/jobs.htm">View Full-Cycle Service Job Board</a>`;
    const menuClick = vi.fn();
    onClick("#menu", menuClick);
    onClick("#board", () => {
      document.body.innerHTML = bodyOfFixture("results-page-1");
    });
    await expect(navigateToResults({ holdMs: 0, timeout: 500 })).resolves.toEqual({
      navigated: true,
    });
    expect(menuClick).not.toHaveBeenCalled();
    expect(getPageKind().kind).toBe("results");
  });

  it("does nothing when the results table is already showing", async () => {
    mountFixture("results-page-1");
    await expect(navigateToResults({ holdMs: 0 })).resolves.toEqual({ navigated: false });
  });
});
