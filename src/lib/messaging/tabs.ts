export const dashboardPagePath = "/dashboard.html";

export function dashboardUrl(): string {
  return chrome.runtime.getURL(dashboardPagePath);
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
