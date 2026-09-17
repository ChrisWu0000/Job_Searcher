import type { PageKind } from "@/types";
import { bodyOf, extractPostingId, flatText, isDocumentNode, normalizeWhitespace } from "./parse";
import {
  dataCellCount,
  exists,
  findLabelElement,
  findLabelledText,
  hasPasswordField,
  isVisibleElement,
  type LabelKey,
  query,
  queryAll,
  textPatterns,
} from "./selectors";

export interface PageKindResult {
  kind: PageKind;
  jobId?: string;
  reason?: string;
}

function rootElement(root: ParentNode): ParentNode {
  return bodyOf(root);
}

function pageText(root: ParentNode): string {
  return flatText(rootElement(root));
}

export function countResultRows(root: ParentNode = document): number {
  const table = query("resultsTable", root);
  if (!table) return 0;
  return queryAll("resultsRow", table).filter((row) => dataCellCount(row) > 0).length;
}

function looksLikeLogin(root: ParentNode): boolean {
  if (!hasPasswordField(root)) return false;
  return exists("loginForm", root) || exists("loginUsername", root);
}

function looksLikeApply(root: ParentNode, text: string): boolean {
  if (!textPatterns.applyPage.test(text)) return false;
  return exists("applyPackageSelect", root) || exists("submitButton", root);
}

function hasPostingSections(root: ParentNode): boolean {
  return (
    hasVisibleLabel("jobSummary", root) ||
    hasVisibleLabel("workTermDuration", root) ||
    hasVisibleLabel("targetedPrograms", root)
  );
}

function hasVisibleLabel(key: LabelKey, root: ParentNode): boolean {
  const label = findLabelElement(key, root);
  return label !== undefined && isVisibleElement(label);
}

function hasPostingFieldLabels(root: ParentNode): boolean {
  return hasVisibleLabel("jobTitle", root) && hasVisibleLabel("organization", root);
}

export function getCurrentJobId(root: ParentNode = document): string | undefined {
  const container = query("postingContainer", root) ?? query("postingIdHolder", root);
  const attributeSources = [container, query("postingIdHolder", root)];
  for (const source of attributeSources) {
    if (!source) continue;
    const attribute =
      source.getAttribute("data-posting-id") ??
      source.getAttribute("data-postingid") ??
      source.getAttribute("data-id");
    if (attribute && attribute.trim().length > 0) return attribute.trim();
    if (source instanceof HTMLInputElement && source.value.trim().length > 0) {
      return source.value.trim();
    }
  }

  const header = query("postingHeader", root);
  if (header) {
    const fromHeader = extractPostingId(flatText(header));
    if (fromHeader) return fromHeader;
  }

  const labelled = findLabelledText("jobId", root);
  const fromLabel = labelled
    ? (extractPostingId(labelled) ?? normalizeWhitespace(labelled))
    : undefined;
  if (fromLabel && /\d/.test(fromLabel)) return fromLabel;

  if (isDocumentNode(root) && typeof location !== "undefined") {
    const fromUrl = extractPostingId(location.search + location.hash);
    if (fromUrl) return fromUrl;
  }
  return undefined;
}

export function getPageKind(root: ParentNode = document): PageKindResult {
  const scope = rootElement(root);
  const text = pageText(root);

  if (looksLikeLogin(scope)) return { kind: "login" };
  if (looksLikeApply(scope, text)) {
    return { kind: "apply", jobId: getCurrentJobId(scope) };
  }
  const overlay = query("postingOverlay", scope);
  if (overlay) {
    return { kind: "posting", jobId: getCurrentJobId(overlay) ?? getCurrentJobId(scope) };
  }
  if (exists("resultsTable", scope)) return { kind: "results" };
  if (hasPostingSections(scope)) {
    return { kind: "posting", jobId: getCurrentJobId(scope) };
  }
  if (hasPostingFieldLabels(scope)) {
    return { kind: "posting", jobId: getCurrentJobId(scope) };
  }

  const reason = [
    `no login form (password field: ${hasPasswordField(scope) ? "yes" : "no"})`,
    `no application package markers (text match: ${textPatterns.applyPage.test(text) ? "yes" : "no"})`,
    "no posting labels (Job Summary / Work Term Duration / Job Title + Organization)",
    `no results rows (results table found: ${query("resultsTable", scope) ? "yes" : "no"})`,
  ].join("; ");
  return { kind: "other", reason };
}

export function describePageKind(result: PageKindResult): string {
  if (result.kind === "other") return `page kind "other": ${result.reason ?? "no reason recorded"}`;
  return result.jobId
    ? `page kind "${result.kind}" for job ${result.jobId}`
    : `page kind "${result.kind}"`;
}
