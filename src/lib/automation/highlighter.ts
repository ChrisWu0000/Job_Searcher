import { sleep } from "@/lib/time";

const hostTagName = "ww-plus-highlighter";
const accent = "#7c3aed";

interface HighlighterElements {
  host: HTMLElement;
  box: HTMLElement;
  tooltip: HTMLElement;
}

let elements: HighlighterElements | undefined;
let target: Element | undefined;
let trackingAttached = false;

function createElements(): HighlighterElements | undefined {
  if (typeof document === "undefined" || !document.documentElement) return undefined;
  const host = document.createElement(hostTagName);
  host.style.setProperty("all", "initial");
  host.style.setProperty("position", "absolute");
  host.style.setProperty("top", "0");
  host.style.setProperty("left", "0");
  host.style.setProperty("width", "0");
  host.style.setProperty("height", "0");
  host.style.setProperty("z-index", "2147483647");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .box {
      position: absolute;
      border: 3px solid ${accent};
      border-radius: 6px;
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
      pointer-events: none;
      transition: top 90ms linear, left 90ms linear, width 90ms linear, height 90ms linear;
      display: none;
    }
    .box[data-pulsing="true"] {
      animation: ww-pulse 600ms ease-in-out infinite;
    }
    .tooltip {
      position: absolute;
      display: none;
      max-width: 320px;
      padding: 4px 8px;
      border-radius: 6px;
      background: ${accent};
      color: #ffffff;
      font: 500 12px/1.4 ui-sans-serif, system-ui, sans-serif;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @keyframes ww-pulse {
      0%, 100% { box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25); }
      50% { box-shadow: 0 0 0 9px rgba(124, 58, 237, 0.1); }
    }
  `;

  const box = document.createElement("div");
  box.className = "box";
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";

  shadow.append(style, box, tooltip);
  document.documentElement.append(host);
  return { host, box, tooltip };
}

function ensureElements(): HighlighterElements | undefined {
  if (elements?.host.isConnected) return elements;
  elements = createElements();
  return elements;
}

function reposition(): void {
  if (!elements || !target) return;
  if (!target.isConnected) {
    hide();
    return;
  }
  const rect = target.getBoundingClientRect();
  const scrollX = typeof window === "undefined" ? 0 : window.scrollX;
  const scrollY = typeof window === "undefined" ? 0 : window.scrollY;
  const top = rect.top + scrollY;
  const left = rect.left + scrollX;
  elements.box.style.top = `${top - 3}px`;
  elements.box.style.left = `${left - 3}px`;
  elements.box.style.width = `${rect.width}px`;
  elements.box.style.height = `${rect.height}px`;
  elements.tooltip.style.top = `${Math.max(top - 28, scrollY + 4)}px`;
  elements.tooltip.style.left = `${left}px`;
}

function attachTracking(): void {
  if (trackingAttached || typeof window === "undefined") return;
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  trackingAttached = true;
}

function detachTracking(): void {
  if (!trackingAttached || typeof window === "undefined") return;
  window.removeEventListener("scroll", reposition, true);
  window.removeEventListener("resize", reposition);
  trackingAttached = false;
}

export function show(element: Element, label: string): void {
  const current = ensureElements();
  if (!current) return;
  target = element;
  current.box.style.display = "block";
  current.tooltip.style.display = label.length > 0 ? "block" : "none";
  current.tooltip.textContent = label;
  attachTracking();
  reposition();
}

export function hide(): void {
  target = undefined;
  detachTracking();
  if (!elements) return;
  elements.box.style.display = "none";
  elements.box.removeAttribute("data-pulsing");
  elements.tooltip.style.display = "none";
}

export async function pulse(element: Element, label: string, durationMs = 1200): Promise<void> {
  show(element, label);
  elements?.box.setAttribute("data-pulsing", "true");
  await sleep(durationMs);
  hide();
}

export function dispose(): void {
  hide();
  elements?.host.remove();
  elements = undefined;
}

export function isVisible(): boolean {
  return target !== undefined;
}
