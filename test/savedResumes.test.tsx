import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SavedResumeLibrary from "@/components/resume/SavedResumeLibrary";
import { savedResumeManifestSchema } from "@/lib/resume/saved";

const resumes = [
  {
    jobId: "123",
    company: "Persona",
    title: "Engineer",
    stem: "123-persona",
    tailoringNote: "APIs and reliability.",
  },
  {
    jobId: "456",
    company: "CodeRabbit",
    title: "Developer",
    stem: "456-coderabbit",
    tailoringNote: "Static analysis and tests.",
  },
];

let root: Root | undefined;
let container: HTMLDivElement;

async function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<SavedResumeLibrary />));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("saved resume library", () => {
  it("keeps the selected job, PDF, source, and rendered preview together", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => resumes }));
    await render();
    expect(container.querySelector("h2")?.textContent).toBe("Persona");
    const button = Array.from(container.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("CodeRabbit"),
    );
    await act(async () => button?.click());
    expect(container.querySelector("h2")?.textContent).toBe("CodeRabbit");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "./resumes/previews/456-coderabbit.png",
    );
    expect(container.querySelector("a[download]")?.getAttribute("href")).toBe(
      "./resumes/456-coderabbit.pdf",
    );
    expect(container.querySelector('a[href$=".tex"]')?.getAttribute("href")).toBe(
      "./resumes/456-coderabbit.tex",
    );
  });

  it("shows a useful error when local files are missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("not available");
    expect(container.querySelector("a[download]")).toBeNull();
  });

  it("rejects duplicate jobs and paths outside the resume directory", () => {
    expect(savedResumeManifestSchema.safeParse([...resumes, resumes[0]]).success).toBe(false);
    expect(
      savedResumeManifestSchema.safeParse([{ ...resumes[0], stem: "../secret" }]).success,
    ).toBe(false);
  });
});
