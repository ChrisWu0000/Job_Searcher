import { afterEach, describe, expect, it, vi } from "vitest";
import { openInOverleaf, overleafDocsUrl } from "@/components/resume/overleaf";

interface CapturedForm {
  action: string;
  method: string;
  target: string;
  fields: Record<string, string>;
  attached: boolean;
}

function captureSubmits(): CapturedForm[] {
  const captured: CapturedForm[] = [];
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
    this: HTMLFormElement,
  ) {
    const fields: Record<string, string> = {};
    for (const input of this.querySelectorAll("input")) fields[input.name] = input.value;
    captured.push({
      action: this.action,
      method: this.method,
      target: this.target,
      fields,
      attached: this.isConnected,
    });
  });
  return captured;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("openInOverleaf", () => {
  it("posts the encoded snippet to Overleaf in a new tab", () => {
    const captured = captureSubmits();
    openInOverleaf("\\documentclass{article} % 100% done");

    expect(captured).toHaveLength(1);
    const form = captured[0];
    expect(form?.action).toBe(overleafDocsUrl);
    expect(form?.method).toBe("post");
    expect(form?.target).toBe("_blank");
    expect(form?.attached).toBe(true);
    expect(form?.fields.snip_name).toBe("resume.tex");
    expect(form?.fields.encoded_snip).toBe(
      encodeURIComponent("\\documentclass{article} % 100% done"),
    );
  });

  it("leaves no form behind", () => {
    captureSubmits();
    openInOverleaf("hello");
    expect(document.querySelectorAll("form")).toHaveLength(0);
  });
});
