document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.getElementById("fill").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, "autofill", (count) => {
    status.textContent = chrome.runtime.lastError
      ? "Open a Greenhouse, Lever or Ashby application first."
      : `Filled ${count || 0} fields.`;
  });
});
