import { type VisibleActionOptions, visibleClick, visibleType } from "@/lib/automation/actions";
import { waterlooWorksJobSearchPath, waterlooWorksJobSearchUrl } from "@/lib/messaging/tabs";
import { waitFor } from "./observer";
import { countResultRows, getCurrentJobId, getPageKind } from "./pageKind";
import { normalizeWhitespace } from "./parse";
import { findResultsRow, firstResultsRowId } from "./scraper";
import { isVisibleElement, query, quickFilterToggles } from "./selectors";

export class NavigationError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "NavigationError";
    this.step = step;
  }
}

export const defaultNavigationTimeoutMs = 15_000;

function isDisabled(element: HTMLElement): boolean {
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element.hasAttribute("disabled")) return true;
  if (element.classList.contains("disabled")) return true;
  const container = element.closest("li, .pagination__item");
  return container?.classList.contains("disabled") === true;
}

export interface NavigationOptions extends VisibleActionOptions {
  assign?: (url: string) => void;
}

function isOnJobSearchPage(): boolean {
  return typeof location !== "undefined" && location.pathname.endsWith(waterlooWorksJobSearchPath);
}

export const requiredQuickFilters: RegExp[] = [/^my program$/i];
export const closeControlPattern = /^(close\s*)?close$/i;

function overlayCloseControl(overlay: HTMLElement): HTMLElement | undefined {
  const bar = query("postingActionBar", overlay) ?? query("postingActionBar");
  return (
    (bar ? findClickableByText(closeControlPattern, bar) : undefined) ??
    findClickableByText(closeControlPattern, overlay) ??
    query("postingBackLink", overlay)
  );
}

export async function closePostingOverlay(options: VisibleActionOptions = {}): Promise<boolean> {
  const overlay = query("postingOverlay");
  if (!overlay) return false;
  const control = overlayCloseControl(overlay);
  if (!control) {
    throw new NavigationError("closePostingOverlay", "the posting overlay has no close control");
  }
  await visibleClick(control, "Close posting", () => query("postingOverlay") === undefined, {
    timeout: defaultNavigationTimeoutMs,
    ...options,
  });
  return true;
}

export async function applyQuickFilters(
  options: VisibleActionOptions = {},
): Promise<{ changed: boolean; active: string[] }> {
  let changed = false;
  for (const pattern of requiredQuickFilters) {
    const toggle = quickFilterToggles(document).find((candidate) => pattern.test(candidate.label));
    if (!toggle || toggle.on) continue;
    await visibleClick(
      toggle.button,
      `Quick filter ${toggle.label}`,
      () =>
        quickFilterToggles(document).find((candidate) => pattern.test(candidate.label))?.on ===
        true,
      { timeout: defaultNavigationTimeoutMs, ...options },
    );
    changed = true;
  }
  const active = quickFilterToggles(document)
    .filter((toggle) => toggle.on)
    .map((toggle) => toggle.label);
  return { changed, active };
}
const clickableSelector = "a, button, [role='button'], [role='menuitem'], [role='tab']";

export function findClickableByText(
  pattern: RegExp,
  root: ParentNode = document,
): HTMLElement | undefined {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(clickableSelector));
  return candidates.find(
    (element) =>
      isVisibleElement(element) &&
      !isDisabled(element) &&
      pattern.test(normalizeWhitespace(element.getAttribute("aria-label") ?? element.textContent)),
  );
}

export function nextPageLink(root: ParentNode = document): HTMLElement | undefined {
  const link = query("pagerNext", root);
  if (!link || isDisabled(link)) return undefined;
  return link;
}

export function hasNextResultsPage(root: ParentNode = document): boolean {
  return nextPageLink(root) !== undefined;
}

export async function nextResultsPage(
  options: VisibleActionOptions = {},
): Promise<{ hadNextPage: boolean }> {
  const link = nextPageLink();
  if (!link) return { hadNextPage: false };
  const previousFirstRowId = firstResultsRowId();
  await visibleClick(
    link,
    "Next results page",
    () => {
      const current = firstResultsRowId();
      return current !== undefined && current !== previousFirstRowId;
    },
    { timeout: defaultNavigationTimeoutMs, ...options },
  );
  return { hadNextPage: true };
}

export function isShowingJob(jobId: string, root: ParentNode = document): boolean {
  const kind = getPageKind(root);
  if (kind.kind !== "posting" && kind.kind !== "apply") return false;
  return getCurrentJobId(root) === jobId;
}

export async function openJob(
  jobId: string,
  options: VisibleActionOptions = {},
): Promise<{ opened: boolean }> {
  if (isShowingJob(jobId)) return { opened: true };
  if (!/^\d+$/.test(jobId))
    throw new NavigationError("openJob", "a numeric WaterlooWorks job ID is required");
  await closePostingOverlay(options);
  let row = findResultsRow(jobId);
  if (!row) {
    await navigateToResults(options);
    row = findResultsRow(jobId);
  }
  if (!row) {
    const clear = query("jobSearchClear");
    if (clear) {
      await visibleClick(
        clear,
        "Clear filters to look up saved job",
        () => query("jobSearchClear") === undefined,
        {
          timeout: defaultNavigationTimeoutMs,
          ...options,
        },
      );
    }
    const input = query("jobSearchKeyword");
    const submit = query("jobSearchSubmit");
    if (!(input instanceof HTMLInputElement) || !submit) {
      throw new NavigationError(
        "openJob",
        `job ${jobId} is not present in the results table and no keyword search control is available`,
      );
    }
    await visibleType(input, jobId, `Find job ${jobId}`, options);
    await visibleClick(
      submit,
      `Search for job ${jobId}`,
      () => findResultsRow(jobId) !== undefined,
      {
        timeout: defaultNavigationTimeoutMs,
        ...options,
      },
    ).catch((cause: unknown) => {
      throw new NavigationError(
        "openJob",
        `Job ${jobId} was not found after searching All Jobs. It may have closed or be unavailable to your account. ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    });
    row = findResultsRow(jobId);
  }
  if (!row)
    throw new NavigationError("openJob", `Job ${jobId} disappeared from the search results`);
  const link = query("resultsRowLink", row) ?? row;
  await visibleClick(link, `Open job ${jobId}`, () => isShowingJob(jobId), {
    timeout: defaultNavigationTimeoutMs,
    ...options,
  });
  return { opened: true };
}

async function openJobSearch(
  kind: string,
  options: NavigationOptions,
): Promise<{ navigated: boolean }> {
  const timeout = options.timeout ?? defaultNavigationTimeoutMs;

  if (isOnJobSearchPage()) {
    await waitFor(
      () =>
        getPageKind().kind === "results" ||
        findClickableByText(/^all jobs$/i) ||
        quickFilterToggles(document).length > 0 ||
        undefined,
      {
        timeout,
        label: "the Full-Cycle job search controls to load",
      },
    );
    if (getPageKind().kind === "results") return { navigated: true };
  }

  const allJobs = findClickableByText(/^all jobs$/i);
  if (allJobs) {
    await visibleClick(allJobs, "All Jobs", () => getPageKind().kind === "results", {
      ...options,
      timeout,
    });
    return { navigated: true };
  }

  if (quickFilterToggles(document).length > 0) {
    const { changed } = await applyQuickFilters({ ...options, timeout });
    if (changed || getPageKind().kind === "results") {
      await waitFor(() => getPageKind().kind === "results" || undefined, {
        timeout,
        label: "the results table after applying the quick filters",
      });
      return { navigated: true };
    }
  }

  if (!isOnJobSearchPage()) {
    const pathname = typeof location === "undefined" ? "" : location.pathname;
    const pattern =
      /\/co-op\/(?:student|index)\.htm$/.test(pathname) || pathname.endsWith("/co-op.htm")
        ? /^(?:view )?full[-\s]?cycle service(?: job board)?$/i
        : /\/co-op\/full(?:\.htm|\/)/.test(pathname)
          ? /^(?:jobs\s*\/\s*applications|view full[-\s]?cycle service job board)$/i
          : /^co[-\s]?op jobs$/i;
    const entry =
      findClickableByText(/^view full[-\s]?cycle service job board$/i) ??
      findClickableByText(pattern);
    if (entry) {
      await visibleClick(entry, normalizeWhitespace(entry.textContent), undefined, options);
      return { navigated: true };
    }
    const assign = options.assign ?? ((url: string) => location.assign(url));
    assign(waterlooWorksJobSearchUrl);
    return { navigated: true };
  }

  throw new NavigationError(
    "navigateToResults",
    `the job search page shows no results table and no quick filters on this ${kind} page; open the job search results in WaterlooWorks`,
  );
}

export async function navigateToResults(
  options: NavigationOptions = {},
): Promise<{ navigated: boolean }> {
  if (getPageKind().kind === "login") {
    throw new NavigationError(
      "navigateToResults",
      "Log in to WaterlooWorks before opening the job search",
    );
  }
  if (await closePostingOverlay(options)) {
    if (getPageKind().kind === "results") return { navigated: true };
  }
  if (getPageKind().kind === "results") return { navigated: false };

  const backLink = query("postingBackLink");
  if (backLink) {
    await visibleClick(backLink, "Back to results", () => getPageKind().kind === "results", {
      timeout: defaultNavigationTimeoutMs,
      ...options,
    });
    return { navigated: true };
  }

  const kind = getPageKind().kind;
  if (kind !== "posting" && kind !== "apply") {
    return openJobSearch(kind, options);
  }

  if (typeof history !== "undefined") {
    history.back();
    await waitFor(() => countResultRows() > 0 || undefined, {
      timeout: options.timeout ?? defaultNavigationTimeoutMs,
      label: "the results table after going back",
    });
    return { navigated: true };
  }

  throw new NavigationError("navigateToResults", "no way back to the results table was found");
}
