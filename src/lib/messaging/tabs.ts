export const waterlooWorksOrigin = "https://waterlooworks.uwaterloo.ca";
export const waterlooWorksMatchPattern = `${waterlooWorksOrigin}/*`;
export const waterlooWorksJobSearchPath = "/myAccount/co-op/full/jobs.htm";
export const waterlooWorksJobSearchUrl = `${waterlooWorksOrigin}${waterlooWorksJobSearchPath}`;
export const dashboardPagePath = "/dashboard.html";

const rememberedTabKey = "tabs:waterlooworks";

export function dashboardUrl(): string {
  return chrome.runtime.getURL(dashboardPagePath);
}

export function isWaterlooWorksUrl(url: string | undefined): boolean {
  return url?.startsWith(waterlooWorksOrigin) === true;
}

function isWaterlooWorksTab(tab: chrome.tabs.Tab): boolean {
  return isWaterlooWorksUrl(tab.url) || isWaterlooWorksUrl(tab.pendingUrl);
}

export async function findWaterlooWorksTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = (await chrome.tabs.query({})).filter(
    (tab) => tab.id !== undefined && isWaterlooWorksTab(tab),
  );
  const active = tabs.find((tab) => tab.active);
  if (active) return active;
  return tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}

async function rememberWaterlooWorksTab(tabId: number): Promise<void> {
  await chrome.storage.session.set({ [rememberedTabKey]: tabId });
}

export async function recallWaterlooWorksTab(): Promise<chrome.tabs.Tab | undefined> {
  const stored = await chrome.storage.session.get(rememberedTabKey);
  const tabId = stored[rememberedTabKey];
  if (typeof tabId !== "number") return undefined;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    await chrome.storage.session.remove(rememberedTabKey);
    return undefined;
  }
}

export async function focusOrCreateWaterlooWorksTab(
  url?: string,
): Promise<{ tabId: number; created: boolean }> {
  const existing = (await findWaterlooWorksTab()) ?? (await recallWaterlooWorksTab());
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true, ...(url ? { url } : {}) });
    if (existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    await rememberWaterlooWorksTab(existing.id);
    return { tabId: existing.id, created: false };
  }
  const created = await chrome.tabs.create({
    url: url ?? waterlooWorksJobSearchUrl,
    active: true,
  });
  if (created.id === undefined) throw new Error("failed to create a WaterlooWorks tab");
  await rememberWaterlooWorksTab(created.id);
  return { tabId: created.id, created: true };
}

export async function findDashboardTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ url: dashboardUrl() });
  return tabs.find((tab) => tab.id !== undefined);
}

export async function openOrFocusDashboardTab(): Promise<number | undefined> {
  const existing = await findDashboardTab();
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return existing.id;
  }
  const created = await chrome.tabs.create({ url: dashboardUrl(), active: true });
  return created.id;
}
