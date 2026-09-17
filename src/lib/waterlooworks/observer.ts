import { query, type SelectorKey } from "./selectors";

export interface WaitOptions {
  timeout?: number;
  interval?: number;
  root?: Node;
  label?: string;
}

export const defaultWaitTimeoutMs = 10_000;
export const defaultWaitIntervalMs = 100;

export class WaitTimeoutError extends Error {
  readonly label: string;
  readonly timeout: number;

  constructor(label: string, timeout: number) {
    super(`timed out after ${timeout}ms waiting for ${label}`);
    this.name = "WaitTimeoutError";
    this.label = label;
    this.timeout = timeout;
  }
}

function observationRoot(root: Node | undefined): Node | undefined {
  if (root) return root;
  if (typeof document === "undefined") return undefined;
  return document.documentElement ?? document;
}

export function waitFor<TResult>(
  predicate: () => TResult | undefined | null | false,
  options: WaitOptions = {},
): Promise<TResult> {
  const timeout = options.timeout ?? defaultWaitTimeoutMs;
  const interval = options.interval ?? defaultWaitIntervalMs;
  const label = options.label ?? "a DOM condition";

  return new Promise<TResult>((resolve, reject) => {
    let settled = false;
    let observer: MutationObserver | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      settled = true;
      observer?.disconnect();
      if (intervalId !== undefined) clearInterval(intervalId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };

    const attempt = (): boolean => {
      if (settled) return true;
      let outcome: TResult | undefined | null | false;
      try {
        outcome = predicate();
      } catch (cause) {
        cleanup();
        reject(cause);
        return true;
      }
      if (outcome === undefined || outcome === null || outcome === false) return false;
      cleanup();
      resolve(outcome);
      return true;
    };

    if (attempt()) return;

    const target = observationRoot(options.root);
    if (target && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        attempt();
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }

    intervalId = setInterval(attempt, interval);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new WaitTimeoutError(label, timeout));
    }, timeout);
  });
}

export function waitForElement(
  key: SelectorKey,
  options: WaitOptions & { searchRoot?: ParentNode } = {},
): Promise<HTMLElement> {
  const searchRoot = options.searchRoot ?? (typeof document === "undefined" ? undefined : document);
  return waitFor(() => (searchRoot ? query(key, searchRoot) : undefined), {
    ...options,
    label: options.label ?? `selector "${key}"`,
  });
}

export function waitForRemoval(element: Element, options: WaitOptions = {}): Promise<true> {
  return waitFor(() => (element.isConnected ? undefined : true), {
    ...options,
    label: options.label ?? "an element to be removed",
  });
}

export function waitForUrlChange(fromUrl: string, options: WaitOptions = {}): Promise<string> {
  return waitFor(
    () => {
      if (typeof location === "undefined") return undefined;
      return location.href === fromUrl ? undefined : location.href;
    },
    { ...options, label: options.label ?? `the url to change from ${fromUrl}` },
  );
}

export function waitForMutation(target: Node, options: WaitOptions = {}): Promise<true> {
  const timeout = options.timeout ?? defaultWaitTimeoutMs;
  const label = options.label ?? "any DOM mutation";
  return new Promise<true>((resolve, reject) => {
    if (typeof MutationObserver === "undefined") {
      reject(new WaitTimeoutError(label, timeout));
      return;
    }
    const observer = new MutationObserver(() => {
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(true);
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new WaitTimeoutError(label, timeout));
    }, timeout);
  });
}

export interface NavigationWatchOptions {
  debounceMs?: number;
  pollMs?: number;
  maxDelayMs?: number;
}

export function watchNavigation(
  onChange: () => void,
  options: NavigationWatchOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? 250;
  const pollMs = options.pollMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? debounceMs * 8;
  let lastUrl = typeof location === "undefined" ? "" : location.href;
  let debounceId: ReturnType<typeof setTimeout> | undefined;
  let pendingSince: number | undefined;

  const flush = (): void => {
    if (debounceId !== undefined) clearTimeout(debounceId);
    debounceId = undefined;
    pendingSince = undefined;
    onChange();
  };

  const fire = (): void => {
    const now = Date.now();
    if (pendingSince === undefined) pendingSince = now;
    if (now - pendingSince >= maxDelayMs) {
      flush();
      return;
    }
    if (debounceId !== undefined) clearTimeout(debounceId);
    debounceId = setTimeout(flush, debounceMs);
  };

  const pollId = setInterval(() => {
    if (typeof location === "undefined") return;
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    fire();
  }, pollMs);

  let observer: MutationObserver | undefined;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(fire);
    const target = document.body ?? document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
  }

  const onPopState = (): void => {
    fire();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onPopState);
  }

  return () => {
    clearInterval(pollId);
    if (debounceId !== undefined) clearTimeout(debounceId);
    observer?.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onPopState);
    }
  };
}
