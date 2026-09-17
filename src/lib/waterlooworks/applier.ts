import { type VisibleActionOptions, visibleClick, visibleSelect } from "@/lib/automation/actions";
import { hashQuestion } from "@/lib/hash";
import type { ApplyPackage, ApplyState, DocumentOption, Question, QuestionKind } from "@/types";
import { applyStateSchema, questionSchema } from "@/types/schemas";
import { openJob } from "./navigator";
import { waitFor } from "./observer";
import { getPageKind } from "./pageKind";
import {
  bodyOf,
  documentKindOf,
  flatText,
  looksLikeConfirmation,
  normalizeWhitespace,
  splitList,
} from "./parse";
import {
  closestFieldGroup,
  freeTextControlsIn,
  labelTextFor,
  query,
  queryAll,
  questionCaptionIn,
  questionContainerOf,
  removeControlsFrom,
  trailingCellsText,
} from "./selectors";

export class ApplyError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "ApplyError";
    this.step = step;
  }
}

export const defaultApplyTimeoutMs = 15_000;

export function applyRoot(root: ParentNode = document): ParentNode {
  const container = query("applyContainer", root);
  if (container) return container;
  return bodyOf(root);
}

function isInputElement(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement;
}

function isSelectElement(element: Element): element is HTMLSelectElement {
  return element instanceof HTMLSelectElement;
}

function mentionsPackage(element: Element): boolean {
  const name = `${element.getAttribute("name") ?? ""} ${element.id}`;
  if (/package/i.test(name)) return true;
  const row = closestFieldGroup(element);
  return row ? /package/i.test(flatText(row)) : false;
}

export function packageInputs(root: ParentNode = document): HTMLInputElement[] {
  const scope = applyRoot(root);
  const strict = queryAll("applyPackageOption", scope)
    .filter(isInputElement)
    .filter((input) => input.type === "radio");
  return strict.filter((input) => !questionContainerOf(input) && mentionsPackage(input));
}

export function packageSelect(root: ParentNode = document): HTMLSelectElement | undefined {
  const scope = applyRoot(root);
  const candidate = query("applyPackageSelect", scope);
  if (candidate && isSelectElement(candidate) && mentionsPackage(candidate)) return candidate;
  return undefined;
}

function labelFor(element: Element): string {
  return labelTextFor(element, (node) => flatText(node));
}

function packageDocumentsFrom(element: Element, packageName: string): ApplyPackage["documents"] {
  const text = trailingCellsText(element, (node) => flatText(node));
  return splitList(text)
    .filter((name) => name !== packageName)
    .map((name) => ({ kind: documentKindOf(name), name }));
}

export function readPackages(root: ParentNode = document): ApplyPackage[] {
  const packages: ApplyPackage[] = [];
  for (const input of packageInputs(root)) {
    const id = input.value || input.id;
    if (!id) continue;
    const name = labelFor(input) || id;
    packages.push({ id, name, documents: packageDocumentsFrom(input, name) });
  }
  const select = packageSelect(root);
  if (select) {
    for (const option of Array.from(select.options)) {
      if (!option.value) continue;
      packages.push({ id: option.value, name: flatText(option) || option.value, documents: [] });
    }
  }
  return packages;
}

export function selectedPackageId(root: ParentNode = document): string | undefined {
  const checked = packageInputs(root).find((input) => input.checked);
  if (checked) return checked.value || checked.id;
  const select = packageSelect(root);
  if (select?.value) return select.value;
  return undefined;
}

export function documentSelects(root: ParentNode = document): HTMLSelectElement[] {
  const scope = applyRoot(root);
  return queryAll("applyDocumentSelect", scope)
    .filter(isSelectElement)
    .filter((select) => !mentionsPackage(select) && !questionContainerOf(select));
}

export function documentSlotKind(select: HTMLSelectElement): string {
  const label = labelFor(select);
  const kind = documentKindOf(label);
  if (kind !== "other") return kind;
  const cleaned = normalizeWhitespace(label.replace(/[*:]/g, ""));
  return cleaned.length > 0 ? cleaned.toLowerCase() : "other";
}

function optionsOf(select: HTMLSelectElement): DocumentOption[] {
  return Array.from(select.options)
    .filter((option) => option.value.trim().length > 0)
    .map((option) => ({ id: option.value, name: flatText(option) || option.value }));
}

function isRequiredControl(element: Element, label: string): boolean {
  if (element.hasAttribute("required")) return true;
  if (element.getAttribute("aria-required") === "true") return true;
  return /\*|\(required\)|required/i.test(label);
}

export function readDocumentSlots(root: ParentNode = document): ApplyState["documents"] {
  return documentSelects(root).map((select) => {
    const label = labelFor(select);
    return {
      kind: documentSlotKind(select),
      required: isRequiredControl(select, label),
      options: optionsOf(select),
      selectedId: select.value.trim().length > 0 ? select.value : undefined,
    };
  });
}

function questionKindOf(controls: Element[]): QuestionKind {
  const first = controls[0];
  if (!first) return "text";
  if (first.tagName.toLowerCase() === "textarea") return "textarea";
  if (isSelectElement(first)) return "select";
  if (isInputElement(first)) {
    if (first.type === "radio") return "radio";
    if (first.type === "checkbox") return "checkbox";
  }
  return "text";
}

function questionOptions(controls: Element[]): string[] | undefined {
  const first = controls[0];
  if (first && isSelectElement(first)) {
    const values = Array.from(first.options)
      .filter((option) => option.value.trim().length > 0)
      .map((option) => flatText(option));
    return values.length > 0 ? values : undefined;
  }
  const choices = controls.filter(isInputElement).map((input) => labelFor(input));
  const filled = choices.filter((choice) => choice.length > 0);
  return filled.length > 0 ? filled : undefined;
}

function questionTextOf(container: Element, controls: Element[]): string {
  const explicit = questionCaptionIn(container);
  if (explicit && !controls.some((control) => explicit.contains(control))) {
    return flatText(explicit);
  }
  const clone = container.cloneNode(true);
  if (clone instanceof Element) {
    removeControlsFrom(clone);
    return flatText(clone);
  }
  return flatText(container);
}

function questionFromContainer(container: Element): Question | undefined {
  const controls = queryAll("prescreenQuestionInput", container);
  if (controls.length === 0) return undefined;
  const text = questionTextOf(container, controls);
  if (text.length === 0) return undefined;
  const parsed = questionSchema.safeParse({
    id: hashQuestion(text),
    text,
    kind: questionKindOf(controls),
    options: questionOptions(controls),
    required: controls.some((control) => isRequiredControl(control, text)),
  });
  return parsed.success ? parsed.data : undefined;
}

function heuristicQuestionContainers(root: ParentNode): Element[] {
  const scope = applyRoot(root);
  const containers = new Set<Element>();
  for (const control of freeTextControlsIn(scope)) {
    if (mentionsPackage(control)) continue;
    const container = closestFieldGroup(control);
    if (!container) continue;
    if (!flatText(container).includes("?")) continue;
    containers.add(container);
  }
  return Array.from(containers);
}

export function getPrescreenQuestions(root: ParentNode = document): Question[] {
  const scope = applyRoot(root);
  const declared = queryAll("prescreenQuestion", scope);
  const containers = declared.length > 0 ? declared : heuristicQuestionContainers(root);
  const questions: Question[] = [];
  const seen = new Set<string>();
  for (const container of containers) {
    const question = questionFromContainer(container);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    questions.push(question);
  }
  return questions;
}

export function submitButton(root: ParentNode = document): HTMLElement | undefined {
  const scope = applyRoot(root);
  const candidates = queryAll("submitButton", scope).filter(
    (element) => !element.hasAttribute("disabled"),
  );
  const explicit = candidates.find((element) =>
    /submit|apply/i.test(flatText(element) || element.getAttribute("value") || ""),
  );
  return explicit ?? candidates[0];
}

export function isSubmitted(root: ParentNode = document): boolean {
  const scope = applyRoot(root);
  const banner = query("confirmationMessage", scope);
  if (banner && looksLikeConfirmation(flatText(banner))) return true;
  return looksLikeConfirmation(flatText(scope));
}

export function confirmationText(root: ParentNode = document): string | undefined {
  const scope = applyRoot(root);
  const banner = query("confirmationMessage", scope);
  if (banner) {
    const text = flatText(banner);
    if (text.length > 0) return text;
  }
  const match = /[^.]*(?:submitted|thank you for applying)[^.]*\./i.exec(flatText(scope));
  return match ? normalizeWhitespace(match[0]) : undefined;
}

export function getApplyState(root: ParentNode = document): ApplyState {
  const submitted = isSubmitted(root);
  const state = {
    packages: readPackages(root),
    selectedPackageId: selectedPackageId(root),
    documents: readDocumentSlots(root),
    questions: getPrescreenQuestions(root),
    canSubmit: !submitted && submitButton(root) !== undefined,
    submitted,
  };
  const parsed = applyStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new ApplyError(
      "getApplyState",
      `apply page state failed validation: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`,
    );
  }
  return parsed.data;
}

export async function startApplication(
  jobId: string,
  options: VisibleActionOptions = {},
): Promise<{ started: boolean }> {
  if (getPageKind().kind === "apply") return { started: true };
  await openJob(jobId, options).catch(() => ({ opened: false }));
  const button = query("applyButton");
  if (!button) {
    throw new ApplyError("startApplication", `no Apply control found for job ${jobId}`);
  }
  await visibleClick(button, `Apply to job ${jobId}`, () => getPageKind().kind === "apply", {
    timeout: defaultApplyTimeoutMs,
    ...options,
  });
  return { started: true };
}

export async function selectPackage(
  packageId: string,
  options: VisibleActionOptions = {},
): Promise<{ selected: boolean }> {
  const radio = packageInputs().find((input) => (input.value || input.id) === packageId);
  if (radio) {
    await visibleClick(radio, `Select package ${packageId}`, () => radio.checked, {
      timeout: defaultApplyTimeoutMs,
      ...options,
    });
    return { selected: true };
  }
  const select = packageSelect();
  if (select) {
    await visibleSelect(select, packageId, `Select package ${packageId}`, {
      timeout: defaultApplyTimeoutMs,
      ...options,
    });
    return { selected: true };
  }
  throw new ApplyError("selectPackage", `no application package control matched "${packageId}"`);
}

export async function selectDocument(
  kind: string,
  documentId: string,
  options: VisibleActionOptions = {},
): Promise<{ selected: boolean }> {
  const select = documentSelects().find((candidate) => documentSlotKind(candidate) === kind);
  if (!select) {
    throw new ApplyError("selectDocument", `no document dropdown matched kind "${kind}"`);
  }
  await visibleSelect(select, documentId, `Select ${kind} document`, {
    timeout: defaultApplyTimeoutMs,
    ...options,
  });
  return { selected: true };
}

export async function submit(
  options: VisibleActionOptions = {},
): Promise<{ submitted: boolean; confirmationText?: string }> {
  if (isSubmitted()) return { submitted: true, confirmationText: confirmationText() };
  const button = submitButton();
  if (!button) throw new ApplyError("submit", "no enabled submit button found on the apply page");
  await visibleClick(button, "Submit application", () => isSubmitted(), {
    timeout: defaultApplyTimeoutMs,
    ...options,
  });
  return { submitted: true, confirmationText: confirmationText() };
}

export function waitForApplyPage(timeout = defaultApplyTimeoutMs): Promise<true> {
  return waitFor(() => (getPageKind().kind === "apply" ? true : undefined), {
    timeout,
    label: "the application page",
  });
}
