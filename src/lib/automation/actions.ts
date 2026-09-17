import { sleep } from "@/lib/time";
import { type WaitOptions, WaitTimeoutError, waitFor } from "@/lib/waterlooworks/observer";
import * as highlighter from "./highlighter";

export const defaultHoldMs = 350;
export const defaultActionTimeoutMs = 10_000;

export interface VisibleActionOptions {
  holdMs?: number;
  timeout?: number;
  interval?: number;
  scroll?: boolean;
}

export class ActionTimeoutError extends Error {
  readonly label: string;
  readonly action: string;
  readonly timeout: number;

  constructor(action: string, label: string, timeout: number) {
    super(`${action} on "${label}" did not reach its expected state within ${timeout}ms`);
    this.name = "ActionTimeoutError";
    this.action = action;
    this.label = label;
    this.timeout = timeout;
  }
}

function scrollIntoView(element: Element): void {
  if (typeof element.scrollIntoView !== "function") return;
  try {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    element.scrollIntoView();
  }
}

async function awaitExpectation(
  action: string,
  label: string,
  expect: (() => boolean) | undefined,
  options: VisibleActionOptions,
): Promise<void> {
  if (!expect) return;
  const timeout = options.timeout ?? defaultActionTimeoutMs;
  const waitOptions: WaitOptions = { timeout, interval: options.interval, label };
  try {
    await waitFor(() => expect() || undefined, waitOptions);
  } catch (cause) {
    if (cause instanceof WaitTimeoutError) throw new ActionTimeoutError(action, label, timeout);
    throw cause;
  }
}

export async function visibleClick(
  element: HTMLElement,
  label: string,
  expect?: () => boolean,
  options: VisibleActionOptions = {},
): Promise<void> {
  if (options.scroll !== false) scrollIntoView(element);
  highlighter.show(element, label);
  try {
    await sleep(options.holdMs ?? defaultHoldMs);
    element.click();
    await awaitExpectation("click", label, expect, options);
  } finally {
    highlighter.hide();
  }
}

function dispatchValueEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function visibleSelect(
  element: HTMLSelectElement,
  value: string,
  label: string,
  options: VisibleActionOptions = {},
): Promise<void> {
  if (options.scroll !== false) scrollIntoView(element);
  highlighter.show(element, label);
  try {
    await sleep(options.holdMs ?? defaultHoldMs);
    const optionValues = Array.from(element.options).map((option) => option.value);
    if (!optionValues.includes(value)) {
      const byText = Array.from(element.options).find(
        (option) => option.textContent?.trim() === value,
      );
      if (!byText) {
        throw new ActionTimeoutError("select", label, 0);
      }
      element.value = byText.value;
    } else {
      element.value = value;
    }
    element.focus();
    dispatchValueEvents(element);
    await awaitExpectation(
      "select",
      label,
      () => element.value === value || element.selectedOptions[0]?.textContent?.trim() === value,
      options,
    );
  } finally {
    highlighter.hide();
  }
}

export async function visibleType(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  label: string,
  options: VisibleActionOptions = {},
): Promise<void> {
  if (options.scroll !== false) scrollIntoView(element);
  highlighter.show(element, label);
  try {
    await sleep(options.holdMs ?? defaultHoldMs);
    element.focus();
    element.value = text;
    dispatchValueEvents(element);
    await awaitExpectation("type", label, () => element.value === text, options);
  } finally {
    highlighter.hide();
  }
}

export async function visibleCheck(
  element: HTMLInputElement,
  label: string,
  options: VisibleActionOptions = {},
): Promise<void> {
  if (element.checked) return;
  await visibleClick(element, label, () => element.checked, options);
}

export async function waitForPageChange(
  trigger: () => void | Promise<void>,
  expect: () => boolean,
  label: string,
  options: VisibleActionOptions = {},
): Promise<void> {
  await trigger();
  await awaitExpectation("navigation", label, expect, options);
}

export { highlighter };
