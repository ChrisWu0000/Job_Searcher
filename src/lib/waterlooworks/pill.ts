import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { sendToBackground } from "@/lib/messaging/client";

const pillStyle: Record<string, string> = {
  position: "fixed",
  right: "18px",
  bottom: "18px",
  "z-index": "2147483646",
  display: "inline-flex",
  "align-items": "center",
  gap: "6px",
  padding: "8px 14px",
  "border-radius": "999px",
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
  color: "#ffffff",
  font: "600 13px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  "letter-spacing": "0.02em",
  "box-shadow": "0 6px 18px rgba(79, 70, 229, 0.35)",
  cursor: "pointer",
};

export function openDashboard(): void {
  sendToBackground({ type: "bg:openDashboard" }).catch((cause: unknown) => {
    console.warn("WW++ could not open the dashboard", cause);
  });
}

export function createPillButton(onOpen: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Open the WW++ dashboard";
  button.textContent = "WW++";
  for (const [property, value] of Object.entries(pillStyle)) {
    button.style.setProperty(property, value);
  }
  button.addEventListener("click", onOpen);
  return button;
}

export async function mountPill(context: ContentScriptContext): Promise<void> {
  const ui = await createShadowRootUi<HTMLButtonElement>(context, {
    name: "ww-plus-pill",
    position: "inline",
    anchor: "body",
    onMount: (container) => {
      const button = createPillButton(openDashboard);
      container.append(button);
      return button;
    },
    onRemove: (button) => {
      button?.remove();
    },
  });
  ui.mount();
}
