import { onMessage } from "@/lib/messaging/client";
import { openOrFocusDashboardTab } from "@/lib/messaging/tabs";

export default defineBackground(() => {
  chrome.action.onClicked.addListener(() => {
    void openOrFocusDashboardTab().catch((cause: unknown) => {
      console.error("Failed to open JobScope dashboard", cause);
    });
  });

  onMessage({
    "bg:openDashboard": async () => {
      const tabId = await openOrFocusDashboardTab();
      return tabId === undefined ? {} : { tabId };
    },
  });
});
