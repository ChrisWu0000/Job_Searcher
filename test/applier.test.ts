import { beforeEach, describe, expect, it } from "vitest";
import { hashQuestion } from "@/lib/hash";
import {
  getApplyState,
  getPrescreenQuestions,
  isSubmitted,
  selectDocument,
  selectPackage,
  submitButton,
} from "@/lib/waterlooworks/applier";
import { mountFixture, parseFixture } from "./fixtures/waterlooworks/load";

describe("getApplyState", () => {
  it("reads existing packages, document slots and questions", () => {
    const state = getApplyState(parseFixture("apply-with-packages"));

    expect(state.packages.map((entry) => entry.id)).toEqual(["1201", "1202"]);
    expect(state.packages[0]?.name).toBe("Software - Fall 2026");
    expect(state.packages[0]?.documents).toEqual([
      { kind: "resume", name: "Resume - B Zhou.pdf" },
      { kind: "coverLetter", name: "Cover Letter - Datadog.pdf" },
      { kind: "gradeReport", name: "Grade Report.pdf" },
    ]);
    expect(state.selectedPackageId).toBe("1201");

    expect(state.documents.map((slot) => slot.kind)).toEqual([
      "resume",
      "coverLetter",
      "gradeReport",
    ]);
    const resumeSlot = state.documents[0];
    expect(resumeSlot?.required).toBe(true);
    expect(resumeSlot?.selectedId).toBeUndefined();
    expect(resumeSlot?.options).toEqual([
      { id: "9001", name: "Resume - B Zhou.pdf" },
      { id: "9002", name: "Resume - Infra.pdf" },
    ]);
    expect(state.documents[1]?.required).toBe(false);

    expect(state.questions).toHaveLength(2);
    expect(state.canSubmit).toBe(true);
    expect(state.submitted).toBe(false);
  });

  it("handles a package dropdown and no questions", () => {
    const parsed = parseFixture("apply-no-questions");
    const packageDropdown = parsed.querySelector("#package-select") as HTMLSelectElement | null;
    if (packageDropdown) packageDropdown.value = "1202";
    const state = getApplyState(parsed);
    expect(state.packages.map((entry) => entry.id)).toEqual(["1201", "1202"]);
    expect(state.selectedPackageId).toBe("1202");
    expect(state.questions).toEqual([]);
    expect(state.documents.map((slot) => slot.kind)).toEqual(["resume", "gradeReport"]);
    expect(state.documents[0]?.selectedId).toBe("9001");
    expect(state.canSubmit).toBe(true);
  });

  it("reports a submitted application and refuses to offer submit again", () => {
    const document = parseFixture("apply-confirmation");
    const state = getApplyState(document);
    expect(state.submitted).toBe(true);
    expect(state.canSubmit).toBe(false);
    expect(isSubmitted(document)).toBe(true);
    expect(submitButton(document)).toBeUndefined();
  });
});

describe("getPrescreenQuestions", () => {
  it("reads the questions without answering any of them", () => {
    const questions = getPrescreenQuestions(parseFixture("apply-with-packages"));
    expect(questions).toHaveLength(2);

    const [eligibility, essay] = questions;
    expect(eligibility?.text).toBe(
      "Are you legally eligible to work in the United States for the entire work term?",
    );
    expect(eligibility?.kind).toBe("select");
    expect(eligibility?.options).toEqual(["Yes", "No"]);
    expect(eligibility?.required).toBe(true);

    expect(essay?.kind).toBe("textarea");
    expect(essay?.required).toBe(false);
    expect(Object.keys(essay ?? {})).not.toContain("answer");
  });

  it("derives question ids from a stable hash of the question text", () => {
    const first = getPrescreenQuestions(parseFixture("apply-with-packages"));
    const second = getPrescreenQuestions(parseFixture("apply-with-packages"));
    expect(first.map((question) => question.id)).toEqual(second.map((question) => question.id));
    expect(first[0]?.id).toBe(hashQuestion(first[0]?.text ?? ""));
  });

  it("returns nothing when the employer asked nothing", () => {
    expect(getPrescreenQuestions(parseFixture("apply-no-questions"))).toEqual([]);
  });
});

describe("visible actions on the apply form", () => {
  beforeEach(() => {
    mountFixture("apply-with-packages");
  });

  it("selects a document through a real change event", async () => {
    const changes: string[] = [];
    const select = document.querySelector("#doc-resume");
    select?.addEventListener("change", () => {
      changes.push("change");
    });

    await selectDocument("resume", "9002", { holdMs: 0, timeout: 2000 });

    expect((select as HTMLSelectElement | null)?.value).toBe("9002");
    expect(changes).toHaveLength(1);
    expect(getApplyState(document).documents[0]?.selectedId).toBe("9002");
  });

  it("selects a package radio by clicking it", async () => {
    await selectPackage("1202", { holdMs: 0, timeout: 2000 });
    expect(getApplyState(document).selectedPackageId).toBe("1202");
  });

  it("rejects an unknown document kind", async () => {
    await expect(selectDocument("portfolio", "9001", { holdMs: 0 })).rejects.toThrow(
      /no document dropdown/,
    );
  });
});
