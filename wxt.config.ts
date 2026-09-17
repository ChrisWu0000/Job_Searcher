import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "WW++",
    description:
      "Local job database, ranking engine, and assisted application runner for WaterlooWorks.",
    permissions: ["storage", "tabs"],
    host_permissions: ["https://waterlooworks.uwaterloo.ca/*", "https://openrouter.ai/*"],
    action: { default_title: "Open WW++" },
  },
});
