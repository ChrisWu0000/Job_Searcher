export const apiKeyStorageKey = "openrouter:apiKey";

export async function getApiKey(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(apiKeyStorageKey);
  const value = stored[apiKeyStorageKey];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [apiKeyStorageKey]: key.trim() });
}

export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(apiKeyStorageKey);
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== undefined;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

export function onApiKeyChanged(handler: (key: string | undefined) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ) => {
    if (areaName !== "local") return;
    const change = changes[apiKeyStorageKey];
    if (!change) return;
    handler(typeof change.newValue === "string" ? change.newValue : undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
