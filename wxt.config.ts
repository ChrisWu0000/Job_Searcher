import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "JobScope",
    description: "A local job database, ranking engine, and multi-source job board scraper.",
    permissions: ["storage", "tabs"],
    host_permissions: [
      "https://openrouter.ai/*",
      "https://raw.githubusercontent.com/*",
      "https://api.ashbyhq.com/*",
      "https://boards-api.greenhouse.io/*",
      "https://api.lever.co/*",
      "https://api.eu.lever.co/*",
      "https://api.smartrecruiters.com/*",
      "https://apply.workable.com/*",
      "https://*.pinpointhq.com/*",
      "https://api.gem.com/*",
      "https://*.myworkdayjobs.com/*",
    ],
    action: { default_title: "Open JobScope" },
  },
});
